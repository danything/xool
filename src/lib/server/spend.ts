import db from "./db";

/**
 * Notes what x.com just charged for. Reads are billed per resource returned
 * whether or not anything is posted about them, so this is recorded on the way
 * out of every successful call, not only the ones that led to a summary.
 */
export function recordSpend(
	userKey: string,
	spend: {
		reads?: number;
		userReads?: number;
		posts?: number;
		impressions?: number;
	},
) {
	db().run(
		"INSERT INTO spend (userKey, at, reads, userReads, posts, impressions) VALUES (?, ?, ?, ?, ?, ?)",
		[
			userKey,
			Date.now(),
			spend.reads ?? 0,
			spend.userReads ?? 0,
			spend.posts ?? 0,
			spend.impressions ?? 0,
		],
	);
}

/** The UTC day x.com deduplicates within. It resets at midnight UTC. */
const utcDay = () => new Date().toISOString().slice(0, 10);

/**
 * How many of these posts have not been paid for yet today, having marked them
 * as paid for. x.com charges per resource returned but only once per UTC day,
 * so the second read of a post before midnight is free -- which happens
 * whenever the button is pressed twice, or pressed and then followed by the
 * nightly run over the same day.
 *
 * Keyed on the post alone rather than the post and the reader: the project is
 * what gets billed, and nobody else can return your posts anyway.
 */
export function chargeableReads(postIds: string[]): number {
	const day = utcDay();
	const insert = db().query(
		"INSERT OR IGNORE INTO readCharge (day, postId) VALUES (?, ?)",
	);

	let fresh = 0;
	db().transaction(() => {
		for (const postId of postIds) {
			if (insert.run(day, postId).changes > 0) fresh += 1;
		}
		// Yesterday is kept so a run that starts before midnight and finishes
		// after it does not charge twice for what it already counted.
		db().run("DELETE FROM readCharge WHERE day < ?", [
			new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000)
				.toISOString()
				.slice(0, 10),
		]);
	})();
	return fresh;
}

/**
 * The account lookup behind the top page runs on every visit, but x.com only
 * charges for the first read of a resource in a UTC day. Recording every visit
 * would put a number on the admin page that bears no relation to the bill, so
 * only the first one each day is written down.
 */
export function recordUserRead(userKey: string) {
	const dayStart = Date.parse(`${utcDay()}T00:00:00Z`);
	const seen = db()
		.query<{ id: number }, [string, number]>(
			"SELECT id FROM spend WHERE userKey = ? AND at >= ? AND userReads > 0 LIMIT 1",
		)
		.get(userKey, dayStart);
	if (seen !== null) return;
	recordSpend(userKey, { userReads: 1 });
}
