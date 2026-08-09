import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { extname } from "node:path";
import { handler } from "./handler.js";

// A rollout runs two pods at once and every build renames its chunks, so a
// page served by one pod can ask the other for JavaScript it has never heard
// of. The asset directory is shared between them to fix that -- but SvelteKit
// answers anything unmatched under /_app with a 404 before hooks run, and the
// static handler it would have used builds its file list once at startup, so
// neither ever sees a file that appeared after this pod booted.
//
// Hence this: assets come off disk on every request, ahead of SvelteKit.
const ASSETS = "/_app/immutable/";
const CLIENT = "build/client";
const TYPES = {
	".css": "text/css",
	".js": "text/javascript",
	".json": "application/json",
	".map": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

/** The precompressed twin the client will accept, if there is one. */
function encoded(file, accept) {
	if (accept.includes("br") && existsSync(`${file}.br`)) {
		return { path: `${file}.br`, encoding: "br" };
	}
	if (accept.includes("gzip") && existsSync(`${file}.gz`)) {
		return { path: `${file}.gz`, encoding: "gzip" };
	}
	return existsSync(file) ? { path: file } : undefined;
}

function serveAsset(req, res) {
	let pathname;
	try {
		pathname = decodeURIComponent((req.url ?? "").split("?")[0]);
	} catch {
		return false;
	}
	if (!pathname.startsWith(ASSETS) || pathname.includes("..")) return false;

	const found = encoded(
		`${CLIENT}${pathname}`,
		req.headers["accept-encoding"] ?? "",
	);
	if (found === undefined) return false;

	res.writeHead(200, {
		"content-type": TYPES[extname(pathname)] ?? "application/octet-stream",
		// Hashed filenames: the bytes behind one can never change.
		"cache-control": "public,max-age=31536000,immutable",
		"content-length": statSync(found.path).size,
		...(found.encoding ? { "content-encoding": found.encoding } : {}),
		vary: "Accept-Encoding",
	});
	if (req.method === "HEAD") {
		res.end();
	} else {
		createReadStream(found.path).pipe(res);
	}
	return true;
}

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const shutdownTimeout = Number(process.env.SHUTDOWN_TIMEOUT ?? 30);

const server = http.createServer((req, res) => {
	if (!serveAsset(req, res)) handler(req, res);
});

// Same shutdown behaviour the adapter's own entry point has, and the same
// reason for it: the pod keeps answering what is already in flight while
// Traefik stops sending it anything new.
let shuttingDown = false;
function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	server.closeIdleConnections();
	// Exiting once the last in-flight request is answered, rather than waiting
	// for the kubelet to lose patience: the timer that drives the daily summary
	// would otherwise hold the process open until the grace period runs out.
	server.close(() => process.exit(0));
	setTimeout(() => {
		server.closeAllConnections();
		process.exit(0);
	}, shutdownTimeout * 1000).unref();
}
server.on("request", (req) => {
	req.on("close", () => {
		if (shuttingDown) server.closeIdleConnections();
	});
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen({ host, port }, () => {
	console.log(`Listening on http://${host}:${port}`);
});
