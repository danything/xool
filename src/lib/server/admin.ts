import { accountExists } from "./account";
import db from "./db";
import type { User } from "./model";

// x.com's pay-per-use rates, for turning recorded activity into what it cost.
// Reads of your own posts are the cheap tier and are deduplicated within a UTC
// day; a summary carries no URL, so it is the plain post price.
const READ_COST = 0.001;
const POST_COST = 0.015;
// x.com prices reads of your own data at $0.001 and other users at $0.010.
// users/me is your own record, so it is counted at the owned rate; the
// developer console is the authority if that turns out to be generous.
const USER_READ_COST = 0.001;

/** How far back the daily tables -- and the totals over them -- reach. */
const DAYS = 30;

const one = <T>(sql: string) => db().query<T, []>(sql).get() as T;

const names = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((name) => name.trim())
		.filter((name) => name !== "");

/**
 * Named in the environment, and so beyond anything the running app can change.
 * Nobody can grant themselves this by signing up, and nobody can take it away
 * through the admin page either -- which is what makes it the way back in when
 * a granted admin turns out to be a mistake. Unset means nobody, which is the
 * right answer for a deployment that has not thought about it yet.
 */
export function isEnvAdmin(key: string | undefined): boolean {
	if (key === undefined) return false;
	const xUser = db()
		.query<User, [string]>("SELECT * FROM user WHERE key = ?")
		.get(key);
	return (
		xUser !== null && names(process.env.ADMIN_X_IDS).includes(xUser.socialId)
	);
}

/**
 * Either named in the environment or handed the role by someone who already
 * had it. The database half exists so that adding an admin does not mean
 * editing a manifest and waiting for a rollout; the environment half exists so
 * that the database half can never lock everyone out.
 */
export function isAdmin(key: string | undefined): boolean {
	if (key === undefined) return false;
	if (isEnvAdmin(key)) return true;
	return (
		db()
			.query<{ userKey: string }, [string]>(
				"SELECT userKey FROM admin WHERE userKey = ?",
			)
			.get(key) !== null
	);
}

export type AdminUser = {
	userKey: string;
	socialId: string;
	admin: boolean;
	/** Granted in the environment, so the page must not offer to revoke it. */
	fixed: boolean;
};

/** Everyone who has signed in, and whether they can open this page. */
export function adminUsers(): AdminUser[] {
	return db()
		.query<{ userKey: string; socialId: string; granted: number }, []>(`
			SELECT user.key AS userKey,
			       user.socialId AS socialId,
			       (SELECT COUNT(*) FROM admin WHERE admin.userKey = user.key) AS granted
			FROM user ORDER BY user.socialId LIMIT 200
		`)
		.all()
		.map((row) => {
			const fixed = isEnvAdmin(row.userKey);
			return {
				userKey: row.userKey,
				socialId: row.socialId,
				admin: fixed || row.granted > 0,
				fixed,
			};
		});
}

/** The reason it could not be done, or undefined if it was. */
export function setAdmin(
	userKey: string,
	admin: boolean,
	by: string,
): string | undefined {
	if (!accountExists(userKey)) return "そのユーザーは存在しません";
	// Taking it from yourself is how you end up locked out of the page you would
	// need in order to put it back.
	if (!admin && userKey === by) return "自分の権限は解除できません";
	if (!admin && isEnvAdmin(userKey)) return "環境変数で指定された管理者です";

	if (admin) {
		db().run(
			"INSERT OR IGNORE INTO admin (userKey, grantedAt, grantedBy) VALUES (?, ?, ?)",
			[userKey, Date.now(), by],
		);
	} else {
		db().run("DELETE FROM admin WHERE userKey = ?", [userKey]);
	}
	return undefined;
}

/**
 * Removes an account and everything about it: the x.com tokens, the summary
 * settings and their history, and any admin grant.
 *
 * `spend` stays. It is not about the person, it is what x.com charged, and the
 * cost history would be wrong without it.
 */
export function deleteUser(
	userKey: string,
	by: string,
): { error: string } | { ok: true } {
	if (!accountExists(userKey)) return { error: "そのユーザーは存在しません" };
	if (userKey === by) return { error: "自分自身は削除できません" };
	if (isEnvAdmin(userKey)) return { error: "環境変数で指定された管理者です" };

	db().transaction(() => {
		db().run("DELETE FROM admin WHERE userKey = ?", [userKey]);
		db().run("DELETE FROM summaryDay WHERE userKey = ?", [userKey]);
		db().run("DELETE FROM summary WHERE userKey = ?", [userKey]);
		db().run("DELETE FROM user WHERE key = ?", [userKey]);
	})();
	return { ok: true };
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
		userReads: number;
		posted: number;
		impressions: number;
		cost: number;
	}[];
	cost: number;
};

export function summaryAdmin(): SummaryAdmin {
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
				userReads: number;
				posted: number;
				impressions: number;
			},
			[]
		>(`
			SELECT date(at / 1000, 'unixepoch', '+9 hours') AS date,
			       COUNT(DISTINCT userKey) AS users,
			       SUM(reads) AS posts,
			       SUM(userReads) AS userReads,
			       SUM(posts) AS posted,
			       SUM(impressions) AS impressions
			FROM spend GROUP BY date ORDER BY date DESC LIMIT ${DAYS}
		`)
		.all();

	const days = rows.map((row) => ({
		...row,
		cost:
			row.posts * READ_COST +
			row.userReads * USER_READ_COST +
			row.posted * POST_COST,
	}));

	return {
		users,
		enabled,
		failing,
		days,
		// Over the same window as the table below it, not all time -- the label
		// on the page says so.
		cost: days.reduce((sum, day) => sum + day.cost, 0),
	};
}
