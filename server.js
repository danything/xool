import http from "node:http";
import sirv from "sirv";
import { handler } from "./handler.js";

// A rollout runs two pods at once and every build renames its chunks, so a page
// served by one pod can ask the other for JavaScript it has never heard of. The
// asset directory is a volume shared between them to fix that -- but SvelteKit
// answers anything unmatched under /_app with a 404 before hooks run, and the
// static handler it would otherwise use builds its file list once at startup,
// so the older pod never sees a file the newer one dropped in after it booted.
//
// Hence this entry point instead of the adapter's. `dev` is what makes sirv
// look a file up on every request rather than indexing once; it forces
// `cache-control: no-store` along with that, which is exactly wrong for
// content-hashed filenames, so setHeaders puts the real one back.
const PREFIX = "/_app/immutable";
const assets = sirv(`build/client${PREFIX}`, {
	dev: true,
	brotli: true,
	gzip: true,
	setHeaders: (res) =>
		res.setHeader("cache-control", "public,max-age=31536000,immutable"),
});

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const shutdownTimeout = Number(process.env.SHUTDOWN_TIMEOUT ?? 30);

const server = http.createServer((req, res) => {
	const url = req.url ?? "";
	if (!url.startsWith(`${PREFIX}/`)) return handler(req, res);
	// sirv resolves against its own root, so the prefix comes off -- and goes
	// back on for the miss case, where SvelteKit gets the request after all.
	req.url = url.slice(PREFIX.length);
	assets(req, res, () => {
		req.url = url;
		handler(req, res);
	});
});

// Same shutdown behaviour the adapter's own entry point has, and the same
// reason for it: the pod keeps answering what is already in flight while
// Traefik stops sending it anything new.
let shuttingDown = false;
function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	server.closeIdleConnections();
	server.close();
	setTimeout(
		() => server.closeAllConnections(),
		shutdownTimeout * 1000,
	).unref();
}
server.on("request", (req) => {
	req.on("close", () => {
		// A keep-alive connection that falls idle after close() started would
		// otherwise sit there until the timeout above gives up on it.
		if (shuttingDown) server.closeIdleConnections();
	});
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen({ host, port }, () => {
	console.log(`Listening on http://${host}:${port}`);
});
