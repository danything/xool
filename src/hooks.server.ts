import type { Handle } from "@sveltejs/kit";
import { building } from "$app/environment";
import { LGTM_HOST } from "$lib/server/env";
import { siteOf } from "$lib/server/site";
import { postDueSummaries } from "$lib/server/summary";

// Nothing here schedules to the minute. The check is idempotent and only ever
// acts on a day that has already ended, so waking up every so often and asking
// "is yesterday still unsummarised?" survives restarts and rollouts, which a
// timer aimed at midnight would not.
const CHECK_INTERVAL_MS = 5 * 60_000;

if (!building) {
	const tick = () =>
		postDueSummaries().catch((error) =>
			console.error("daily summary failed", error),
		);
	tick();
	// Unreferenced so it never keeps a shutting-down process alive; it still
	// fires for as long as the server is up.
	setInterval(tick, CHECK_INTERVAL_MS).unref();
}

const LGTM_ONLY = ["/lgtm", "/api/gh"];
// The x.com sign-in is not on this list: LGTM offers it too, so that signing in
// both ways links the two into one account.
const XOOL_ONLY = ["/api/summary"];

const startsWith = (path: string, prefixes: string[]) =>
	prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

export const handle: Handle = async ({ event, resolve }) => {
	const site = siteOf(event.url);
	event.locals.site = site;
	const path = event.url.pathname;

	// /images is deliberately left open on both hostnames. Those URLs are
	// already embedded in pull requests under the old one, and an image that
	// stops loading takes the review it was part of with it.
	if (site === "xool" && startsWith(path, LGTM_ONLY)) {
		if (path === "/lgtm" && LGTM_HOST !== undefined) {
			return new Response(null, {
				status: 301,
				headers: { location: `https://${LGTM_HOST}/` },
			});
		}
		return new Response("Not found", { status: 404 });
	}
	if (site === "lgtm") {
		if (startsWith(path, XOOL_ONLY)) {
			return new Response("Not found", { status: 404 });
		}
		// LGTM is the whole site here, so it lives at the root rather than one
		// level down repeating the hostname.
		if (path === "/lgtm") {
			return new Response(null, { status: 301, headers: { location: "/" } });
		}
	}

	return resolve(event);
};
