import db from "./db";
import type { GhUser, User } from "./model";

// x.com's pay-per-use rates, for turning recorded activity into what it cost.
// Reads of your own posts are the cheap tier and are deduplicated within a UTC
// day; a summary carries no URL, so it is the plain post price.
const READ_COST = 0.001;
const POST_COST = 0.015;

const names = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((name) => name.trim())
		.filter((name) => name !== "");

/**
 * Admins are named by environment, not by anything in the database, so nobody
 * can grant it to themselves by signing up. Unset means nobody, which is the
 * right answer for a deployment that has not thought about it yet.
 */
export function isAdmin(key: string | undefined): boolean {
	if (key === undefined) return false;

	const xUser = db()
		.query<User, [string]>("SELECT * FROM user WHERE key = ?")
		.get(key);
	if (xUser !== null && names(process.env.ADMIN_X_IDS).includes(xUser.socialId))
		return true;

	const ghUser = db()
		.query<GhUser, [string]>("SELECT * FROM ghUser WHERE key = ?")
		.get(key);
	return (
		ghUser !== null && names(process.env.ADMIN_GH_LOGINS).includes(ghUser.login)
	);
}

export type SummaryAdmin = {
	users: number;
	enabled: number;
	failing: {
		socialId: string;
		lastSummarizedOn: string | null;
		error: string;
	}[];
	days: {
		date: string;
		users: number;
		posts: number;
		posted: number;
		impressions: number;
		cost: number;
	}[];
	cost: number;
};

export function summaryAdmin(): SummaryAdmin {
	const one = <T>(sql: string) => db().query<T, []>(sql).get() as T;

	const { users } = one<{ users: number }>(
		"SELECT COUNT(*) AS users FROM user",
	);
	const { enabled } = one<{ enabled: number }>(
		"SELECT COUNT(*) AS enabled FROM summary WHERE enabled = 1",
	);

	const failing = db()
		.query<
			{ socialId: string; lastSummarizedOn: string | null; error: string },
			[]
		>(`
			SELECT user.socialId AS socialId, summary.lastSummarizedOn AS lastSummarizedOn,
			       summary.lastError AS error
			FROM summary JOIN user ON user.key = summary.userKey
			WHERE summary.lastError IS NOT NULL
			ORDER BY summary.lastSummarizedOn DESC
		`)
		.all();

	// Billed activity, by the JST day it happened on -- not by the day a summary
	// was about. A manual post is charged today for yesterday, and summaryDay
	// never hears about it at all.
	const rows = db()
		.query<
			{
				date: string;
				users: number;
				posts: number;
				posted: number;
				impressions: number;
			},
			[]
		>(`
			SELECT date(at / 1000, 'unixepoch', '+9 hours') AS date,
			       COUNT(DISTINCT userKey) AS users,
			       SUM(reads) AS posts,
			       SUM(posts) AS posted,
			       SUM(impressions) AS impressions
			FROM spend GROUP BY date ORDER BY date DESC LIMIT 30
		`)
		.all();

	const days = rows.map((row) => ({
		...row,
		cost: row.posts * READ_COST + row.posted * POST_COST,
	}));

	return {
		users,
		enabled,
		failing,
		days,
		cost: days.reduce((sum, day) => sum + day.cost, 0),
	};
}

export type LgtmAdmin = {
	images: number;
	owners: number;
	githubUsers: number;
	uploaders: {
		userKey: string;
		login: string | null;
		socialId: string | null;
		images: number;
		latest: number;
	}[];
	days: { date: string; images: number }[];
};

export function lgtmAdmin(): LgtmAdmin {
	const one = <T>(sql: string) => db().query<T, []>(sql).get() as T;

	const { images } = one<{ images: number }>(
		"SELECT COUNT(*) AS images FROM lImage",
	);
	const { owners } = one<{ owners: number }>(
		"SELECT COUNT(DISTINCT userKey) AS owners FROM lImage",
	);
	const { githubUsers } = one<{ githubUsers: number }>(
		"SELECT COUNT(*) AS githubUsers FROM ghUser",
	);

	// The key itself is a session credential, so it is never shown whole -- who
	// someone is comes from the accounts attached to it.
	const uploaders = db()
		.query<
			{
				userKey: string;
				login: string | null;
				socialId: string | null;
				images: number;
				latest: number;
			},
			[]
		>(`
			SELECT lImage.userKey AS userKey,
			       ghUser.login AS login,
			       user.socialId AS socialId,
			       COUNT(*) AS images,
			       MAX(lImage.createdAt) AS latest
			FROM lImage
			LEFT JOIN ghUser ON ghUser.key = lImage.userKey
			LEFT JOIN user ON user.key = lImage.userKey
			GROUP BY lImage.userKey
			ORDER BY images DESC
			LIMIT 50
		`)
		.all()
		.map((row) => ({ ...row, userKey: row.userKey.slice(0, 8) }));

	const days = db()
		.query<{ date: string; images: number }, []>(`
			SELECT date(createdAt / 1000, 'unixepoch', '+9 hours') AS date,
			       COUNT(*) AS images
			FROM lImage GROUP BY date ORDER BY date DESC LIMIT 30
		`)
		.all();

	return { images, owners, githubUsers, uploaders, days };
}
