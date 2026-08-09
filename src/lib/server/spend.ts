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

/**
 * The account lookup behind the top page runs on every visit, but x.com only
 * charges for the first read of a resource in a UTC day. Recording every visit
 * would put a number on the admin page that bears no relation to the bill, so
 * only the first one each day is written down.
 */
export function recordUserRead(userKey: string) {
	const dayStart = Date.parse(
		`${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
	);
	const seen = db()
		.query<{ id: number }, [string, number]>(
			"SELECT id FROM spend WHERE userKey = ? AND at >= ? AND userReads > 0 LIMIT 1",
		)
		.get(userKey, dayStart);
	if (seen !== null) return;
	recordSpend(userKey, { userReads: 1 });
}
