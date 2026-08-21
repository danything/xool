import db from "./db";

/**
 * What x.com says it actually served, as opposed to what this app believes it
 * asked for. GET /2/usage/tweets counts Post reads only -- account lookups and
 * posts are billed on other meters and never appear here -- so it settles the
 * one number that makes up most of the bill, and settles it exactly.
 *
 * App-only auth: the endpoint refuses both the OAuth 2.0 user tokens this app
 * stores and the client credentials it signs users in with. The bearer token
 * comes from the developer portal and is good for nothing else.
 */
const USAGE_URL =
	"https://api.x.com/2/usage/tweets?days=30&usage.fields=daily_project_usage";

type DailyUsage = { date: string; usage: string };

/** Fetches the last 30 days and records them, or answers with why it could not. */
export async function syncUsage(): Promise<
	{ days: number } | { error: string }
> {
	const token = process.env.X_BEARER_TOKEN;
	if (!token) return { error: "X_BEARER_TOKEN が設定されていません" };

	let res: Response;
	try {
		res = await fetch(USAGE_URL, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(15000),
		});
	} catch (error) {
		return { error: error instanceof Error ? error.name : "failed" };
	}
	if (!res.ok) return { error: `𝕏が${res.status}を返しました` };

	const body = await res.json();
	const rows: DailyUsage[] = body?.data?.daily_project_usage?.usage ?? [];
	const insert = db().query(
		"INSERT OR REPLACE INTO usageDay (day, reads) VALUES (?, ?)",
	);
	db().transaction(() => {
		for (const row of rows) {
			insert.run(row.date.slice(0, 10), Number(row.usage));
		}
	})();
	return { days: rows.length };
}

/** x.com's own count for a UTC day, or undefined if it has not been fetched. */
export function reportedReads(): Map<string, number> {
	const rows = db()
		.query<{ day: string; reads: number }, []>(
			"SELECT day, reads FROM usageDay ORDER BY day DESC LIMIT 30",
		)
		.all();
	return new Map(rows.map((row) => [row.day, row.reads]));
}
