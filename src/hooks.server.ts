import type { Handle } from "@sveltejs/kit";
import { building } from "$app/environment";
import { LGTM_HOST } from "$lib/server/env";
import { siteOf } from "$lib/server/site";
import { postDueSummaries } from "$lib/server/summary";

// The sweep is what makes this reliable: the check is idempotent and only ever
// acts on a day that has already ended, so waking up every so often and asking
// "is yesterday still unsummarised?" survives restarts and rollouts. A cron job
// aimed at midnight does not -- Bun's in-process schedule neither persists nor
// catches up a firing the process slept through -- so it is the punctuality on
// top, not the guarantee underneath.
const CHECK_INTERVAL_MS = 5 * 60_000;
// Named in JST rather than left to the system zone: the container runs in UTC,
// where this would mean 09:00.
const MIDNIGHT_JST = { schedule: "0 0 * * *", tz: "Asia/Tokyo" } as const;

if (!building) {
	// postDueSummaries reads which days are still owed and then writes that they
	// have been dealt with. Two runs overlapping would both see the same day
	// before either recorded it, and both post it -- so a second caller joins
	// the run already in flight instead of starting another.
	let inFlight: Promise<unknown> | undefined;
	const tick = () => {
		inFlight ??= postDueSummaries()
			.catch((error) => console.error("daily summary failed", error))
			.finally(() => {
				inFlight = undefined;
			});
		return inFlight;
	};

	tick();
	// Unreferenced so neither ever keeps a shutting-down process alive; both
	// still fire for as long as the server is up.
	setInterval(tick, CHECK_INTERVAL_MS).unref();
	Bun.cron(MIDNIGHT_JST.schedule, tick, { tz: MIDNIGHT_JST.tz }).unref();
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
