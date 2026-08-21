import { building } from "$app/environment";
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
