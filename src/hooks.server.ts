import { building } from "$app/environment";
import { postDueSummaries } from "$lib/server/summary";
import { syncUsage } from "$lib/server/usage";

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
const USAGE_INTERVAL_MS = 60 * 60_000;

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

	// x.com's own count of what it served, so the estimate on the admin page is
	// checked against the bill rather than trusted. Hourly is plenty: the
	// numbers only move when this app makes a call, and nobody is watching the
	// page for a live figure.
	const pull = () =>
		syncUsage()
			.then((result) => {
				if ("error" in result) console.error("usage sync failed", result.error);
			})
			.catch((error) => console.error("usage sync failed", error));

	tick();
	pull();
	// Unreferenced so none of them ever keeps a shutting-down process alive;
	// they all still fire for as long as the server is up.
	setInterval(tick, CHECK_INTERVAL_MS).unref();
	setInterval(pull, USAGE_INTERVAL_MS).unref();
	Bun.cron(MIDNIGHT_JST.schedule, tick, { tz: MIDNIGHT_JST.tz }).unref();
}
