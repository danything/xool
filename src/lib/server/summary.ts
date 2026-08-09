import { autoAction, type OwnPost } from "./client";
import db from "./db";
import type { Summary, SummaryDay, User } from "./model";

// Everything here is reckoned in JST: the day a summary covers is the day the
// person posting it lived through, not the one UTC happened to be on.
const JST_OFFSET_MS = 9 * 3_600_000;

/** The JST calendar date an instant falls on, as YYYY-MM-DD. */
function jstDate(at: number): string {
	return new Date(at + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
		.toISOString()
		.slice(0, 10);
}

/** An instant in the shape x.com wants for start_time and end_time. */
function isoSeconds(at: number): string {
	return new Date(at).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Midnight JST at the start of a date, as the UTC instant x.com asks for. */
function jstMidnight(date: string): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) - JST_OFFSET_MS)
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z");
}

export function getSummary(userKey: string): Summary | null {
	return db()
		.query<Summary, [string]>("SELECT * FROM summary WHERE userKey = ?")
		.get(userKey);
}

export function setEnabled(userKey: string, enabled: boolean) {
	// lastSummarizedOn stays null on the way in, which makes yesterday due
	// immediately: switching this on is how you find out what it posts, and
	// waiting until midnight to find out is a poor way to learn that.
	// Turning it off and on again does not repost -- the date recorded by that
	// first run is kept.
	db().run(
		`INSERT INTO summary (userKey, enabled) VALUES (?, ?)
		 ON CONFLICT(userKey) DO UPDATE SET enabled = excluded.enabled, lastError = NULL`,
		[userKey, enabled ? 1 : 0],
	);
}

const numberFormat = new Intl.NumberFormat("ja-JP");
const n = (value: number) => numberFormat.format(value);

/** How many days up to and including `date` were posted on, without a gap. */
function streakEndingOn(userKey: string, date: string): number {
	const days = db()
		.query<{ date: string; posts: number }, [string, string]>(
			"SELECT date, posts FROM summaryDay WHERE userKey = ? AND date <= ? ORDER BY date DESC LIMIT 400",
		)
		.all(userKey, date);

	let streak = 0;
	let expected = date;
	for (const day of days) {
		// A missing row is a day this never ran for, which is not evidence of
		// having posted, so it ends the streak just like an empty day does.
		if (day.date !== expected || day.posts === 0) break;
		streak++;
		expected = addDays(expected, -1);
	}
	return streak;
}

export function summaryText(
	date: string,
	posts: OwnPost[],
	options: { previous?: SummaryDay; streak?: number; partial?: boolean } = {},
): string {
	const { previous, streak = 0, partial = false } = options;
	const [, month, day] = date.split("-");
	const heading = partial
		? `${Number(month)}月${Number(day)}日のポスト (0:00〜現在): ${posts.length}件`
		: `${Number(month)}月${Number(day)}日のポスト: ${posts.length}件`;
	// Reaction lines full of zeroes say nothing about a day nobody posted on.
	if (posts.length === 0) return [heading, "", "#ポスト通信簿"].join("\n");

	const total = (pick: (post: OwnPost) => number | undefined) =>
		posts.reduce((sum, post) => sum + (pick(post) ?? 0), 0);

	const replies = posts.filter((post) => post.in_reply_to_user_id).length;
	const likes = total((post) => post.public_metrics?.like_count);
	const reposts = total((post) => post.public_metrics?.retweet_count);
	const replied = total((post) => post.public_metrics?.reply_count);
	const bookmarks = total((post) => post.public_metrics?.bookmark_count);
	const impressions = total((p) => p.non_public_metrics?.impression_count);
	const profileClicks = total((p) => p.non_public_metrics?.user_profile_clicks);
	const linkClicks = total((p) => p.non_public_metrics?.url_link_clicks);
	const best = Math.max(
		0,
		...posts.map((p) => p.non_public_metrics?.impression_count ?? 0),
	);

	const diff =
		previous === undefined || partial
			? ""
			: ` (前日比 ${signed(posts.length - previous.posts)})`;
	// A line whose numbers are all zero says nothing, and every one of them
	// spends part of a post nobody asked to be long.
	const lines = [
		`${heading}${diff}`,
		replies > 0 && `うちリプライ ${replies}件`,
		`いいね ${n(likes)}・リポスト ${n(reposts)}・返信 ${n(replied)}・ブックマーク ${n(bookmarks)}`,
		impressions > 0 &&
			`インプレッション ${n(impressions)} (平均 ${n(Math.round(impressions / posts.length))}・最高 ${n(best)})`,
		profileClicks + linkClicks > 0 &&
			`プロフィールクリック ${n(profileClicks)}・リンククリック ${n(linkClicks)}`,
		streak > 1 && `${streak}日連続でポスト中`,
	].filter((line) => typeof line === "string");

	return [...lines, "", "#ポスト通信簿"].join("\n");
}

function signed(value: number): string {
	return value > 0 ? `+${value}` : `${value}`;
}

/** Whether a summary actually went out. */
async function postSummary(
	row: Summary,
	date: string,
	force: boolean,
): Promise<boolean> {
	const user = db()
		.query<User, [string]>("SELECT * FROM user WHERE key = ?")
		.get(row.userKey);
	if (user === null) return false;

	let lastError: string | null = null;
	let lastPostId: string | null = row.lastPostId;
	let posted = false;

	const ret = await autoAction("ownPosts", row.userKey, {
		id: user.socialId,
		startTime: jstMidnight(date),
		endTime: jstMidnight(addDays(date, 1)),
	});
	const status = ret?.rateLimit?.httpStatus;

	if (ret?.error !== undefined) {
		lastError = ret.error;
	} else if (status !== undefined && status >= 400) {
		lastError = `𝕏がポストの取得を拒否しました (${status})`;
	} else {
		// Yesterday's summary was posted after midnight, so it lands inside this
		// window and would count itself.
		const all: OwnPost[] = ret?.data ?? [];
		const posts = all.filter((post) => post.id !== row.lastPostId);
		const impressions = posts.reduce(
			(sum, post) => sum + (post.non_public_metrics?.impression_count ?? 0),
			0,
		);
		const previous = db()
			.query<SummaryDay, [string, string]>(
				"SELECT * FROM summaryDay WHERE userKey = ? AND date = ?",
			)
			.get(row.userKey, addDays(date, -1));
		const record = (didPost: boolean) =>
			db().run(
				"INSERT OR REPLACE INTO summaryDay (userKey, date, posts, impressions, posted) VALUES (?, ?, ?, ?, ?)",
				[row.userKey, date, posts.length, impressions, didPost ? 1 : 0],
			);
		record(false);

		// A quiet day is normally not worth $0.015 to announce. The run that
		// switching this on kicks off is the exception: someone who just turned
		// it on is waiting to see what it does, and "nothing happened" is a poor
		// answer whether or not it is technically correct.
		if (posts.length > 0 || force) {
			const result = await autoAction("tweet", row.userKey, {
				text: summaryText(date, posts, {
					previous: previous ?? undefined,
					streak: streakEndingOn(row.userKey, date),
				}),
			});
			if (result?.error !== undefined) {
				lastError = result.error;
			} else if (result?.rateLimit?.httpStatus >= 400) {
				lastError = `𝕏がポストを拒否しました (${result.rateLimit.httpStatus})`;
			} else {
				lastPostId = result?.data?.id ?? null;
				posted = true;
				record(true);
			}
		}
	}

	// The date is recorded whether or not it worked, so a failure costs one
	// attempt rather than one every time the timer fires.
	db().run(
		"UPDATE summary SET lastSummarizedOn = ?, lastPostId = ?, lastError = ? WHERE userKey = ?",
		[date, lastPostId, lastError, row.userKey],
	);
	return posted;
}

/**
 * Posts what today looks like so far, for someone who has just switched this
 * on. The day it would otherwise report closed before the tool was watching,
 * so there is nothing to say about it; today has whatever there is.
 *
 * Yesterday is marked as handled either way, so the timer does not follow this
 * up with a second post, and tonight's midnight run still reports today in
 * full -- with this post itself excluded from the count.
 */
export async function postToday(userKey: string, now = Date.now()) {
	const row = getSummary(userKey);
	const user = db()
		.query<User, [string]>("SELECT * FROM user WHERE key = ?")
		.get(userKey);
	if (row === null || user === null) return false;

	const date = jstDate(now);
	let lastError: string | null = null;
	let lastPostId: string | null = row.lastPostId;
	let posted = false;

	const ret = await autoAction("ownPosts", userKey, {
		id: user.socialId,
		startTime: jstMidnight(date),
		// x.com rejects an end_time that is not comfortably in the past.
		endTime: isoSeconds(now - 60_000),
	});
	const status = ret?.rateLimit?.httpStatus;

	if (ret?.error !== undefined) {
		lastError = ret.error;
	} else if (status !== undefined && status >= 400) {
		lastError = `𝕏がポストの取得を拒否しました (${status})`;
	} else {
		const posts: OwnPost[] = ret?.data ?? [];
		const result = await autoAction("tweet", userKey, {
			text: summaryText(date, posts, { partial: true }),
		});
		if (result?.error !== undefined) {
			lastError = result.error;
		} else if (result?.rateLimit?.httpStatus >= 400) {
			lastError = `𝕏がポストを拒否しました (${result.rateLimit.httpStatus})`;
		} else {
			lastPostId = result?.data?.id ?? null;
			posted = true;
		}
	}

	// Deliberately not today: today is not over, and nothing is written to
	// summaryDay for a part of a day that tonight's run will count properly.
	db().run(
		"UPDATE summary SET lastSummarizedOn = ?, lastPostId = ?, lastError = ? WHERE userKey = ?",
		[addDays(date, -1), lastPostId, lastError, userKey],
	);
	return posted;
}

/**
 * Posts the summary for the day that has just ended to everyone who asked for
 * one and has not had it yet, and answers with how many went out. Safe to call
 * as often as you like: a day already summarised is skipped, so restarts and
 * overlapping ticks do not repost.
 *
 * Naming one user is how the toggle asks for its own summary right away, and
 * that run posts even for an empty day.
 */
export async function postDueSummaries(userKey?: string, now = Date.now()) {
	const date = addDays(jstDate(now), -1);
	const due =
		userKey === undefined
			? db()
					.query<Summary, [string]>(
						"SELECT * FROM summary WHERE enabled = 1 AND (lastSummarizedOn IS NULL OR lastSummarizedOn < ?)",
					)
					.all(date)
			: db()
					.query<Summary, [string, string]>(
						"SELECT * FROM summary WHERE enabled = 1 AND userKey = ? AND (lastSummarizedOn IS NULL OR lastSummarizedOn < ?)",
					)
					.all(userKey, date);

	let posted = 0;
	for (const row of due) {
		if (await postSummary(row, date, userKey !== undefined)) posted++;
	}
	return posted;
}
