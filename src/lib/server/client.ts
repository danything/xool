import db from "./db";
import type { User } from "./model";
import { recordUserRead } from "./spend";

export type RateLimit = {
	httpStatus: number;
	limit?: number;
	remaining?: number;
	reset?: number;
	daily?: {
		limit?: number;
		remaining?: number;
		reset?: number;
	};
	retryAfter?: number;
};

function headerNumber(res: Response, name: string) {
	const value = res.headers.get(name);
	if (value === null) return undefined;
	const parsed = Number(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function rateLimitOf(res: Response): RateLimit {
	return {
		httpStatus: res.status,
		limit: headerNumber(res, "x-rate-limit-limit"),
		remaining: headerNumber(res, "x-rate-limit-remaining"),
		reset: headerNumber(res, "x-rate-limit-reset"),
		daily: {
			limit: headerNumber(res, "x-user-limit-24hour-limit"),
			remaining: headerNumber(res, "x-user-limit-24hour-remaining"),
			reset: headerNumber(res, "x-user-limit-24hour-reset"),
		},
		retryAfter: headerNumber(res, "retry-after"),
	};
}

export async function client(
	method: string,
	url: string,
	body: string | null,
	bearer = "",
) {
	const headers =
		bearer === ""
			? {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: `Basic ${Buffer.from(
						`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`,
					).toString("base64")}`,
				}
			: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${bearer}`,
				};

	// One line per call to x.com. Without it a page stuck on its loading state
	// is indistinguishable from a call that never came back, and the only way
	// to tell them apart was to guess.
	const startedAt = Date.now();
	const log = (outcome: string) =>
		console.log(
			`x.com ${method} ${url.split("?")[0]} ${outcome} in ${Date.now() - startedAt}ms`,
		);

	let res: Response;
	try {
		res = await fetch(`https://api.x.com/2/${url}`, {
			method,
			headers,
			body,
			cache: "no-store",
			// Without a deadline a call that never answers leaves whoever awaited it
			// waiting forever -- on the top page that is a skeleton that never turns
			// into anything.
			signal: AbortSignal.timeout(15000),
		});
	} catch (error) {
		log(error instanceof Error ? error.name : "failed");
		throw error;
	}
	log(String(res.status));

	// Callers need the throttling window to decide when a rejected request may
	// be retried, and x.com only reports it in the response headers.
	return {
		...parseBody(await res.text(), res.status),
		rateLimit: rateLimitOf(res),
	};
}

// x.com does not always answer in JSON: an edge error page or an empty body
// comes back for some 429s and 5xxs, and parsing that used to throw out of
// client() as a rejection no caller expected.
function parseBody(text: string, status: number) {
	if (text === "") return { status, error: `x.comが${status}を返しました` };
	try {
		const parsed = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null
			? parsed
			: { status, data: parsed };
	} catch {
		return {
			status,
			error: `x.comの応答を解釈できませんでした: ${text.slice(0, 200)}`,
		};
	}
}

export async function refreshToken(refreshToken: string) {
	const params = new URLSearchParams({
		refresh_token: refreshToken,
		grant_type: "refresh_token",
	});
	return await client("POST", "oauth2/token", params.toString());
}

export type ActionPayload = {
	text?: string;
	id?: string;
	startTime?: string;
	endTime?: string;
};

export async function autoAction(
	type: string,
	key: string,
	payload?: ActionPayload,
) {
	const existUser = db()
		.query<User, [string]>("SELECT * FROM user WHERE key = ?")
		.get(key);
	if (existUser === null)
		return { error: "keyが無効です再ログインしてください" };
	let accessToken = existUser.accessToken;
	// The account lookup costs money like everything else here, and it runs on
	// every visit to the top page. Wrapped so the retry below is counted too:
	// billing follows the call that succeeded, not the one that was tried first.
	const run = async () => {
		const ret = await action(type, accessToken, payload);
		if (type === "me" && ret?.rateLimit?.httpStatus === 200)
			recordUserRead(key);
		return ret;
	};

	const ret = await run();
	if (ret?.status !== 401) return ret;
	const refreshedToken = await refreshToken(existUser.refreshToken);
	// Only invalid_request used to be treated as "sign in again", but x.com has
	// more ways to turn a refresh down -- invalid_grant for a token that was
	// revoked or already spent, unauthorized_client, an outage page. Every one
	// of those left access_token undefined, and the UPDATE below then threw on
	// the undefined binding instead of asking the user to re-authenticate.
	if (!refreshedToken.access_token) return { error: "再認証してください" };
	accessToken = refreshedToken.access_token;
	db().run("UPDATE user SET accessToken = ?, refreshToken = ? WHERE key = ?", [
		accessToken,
		refreshedToken.refresh_token,
		key,
	]);
	return await run();
}

type XResponse<T> = {
	status?: number;
	error?: string;
	data: T;
	rateLimit?: RateLimit;
};

export type OwnPost = {
	id: string;
	text: string;
	created_at: string;
	in_reply_to_user_id?: string;
	public_metrics?: {
		like_count?: number;
		retweet_count?: number;
		reply_count?: number;
		quote_count?: number;
		bookmark_count?: number;
	};
	non_public_metrics?: {
		impression_count?: number;
		user_profile_clicks?: number;
		url_link_clicks?: number;
	};
};

export async function action(
	type: string,
	accessToken: string,
	payload?: ActionPayload,
) {
	switch (type) {
		case "me":
			return (await client("GET", "users/me", null, accessToken)) as XResponse<{
				id: number;
				name: string;
				username: string;
			}>;
		case "tweet":
			return await client(
				"POST",
				"tweets",
				JSON.stringify({ text: payload?.text }),
				accessToken,
			);
		case "ownPosts": {
			const searchParams = new URLSearchParams({
				max_results: "100",
				// Reposts carry no writing of your own and no impressions worth
				// counting, so they would only inflate the number.
				exclude: "retweets",
				// x.com bills per resource returned, not per field, so every extra
				// field on the posts we are already paying to read is free.
				"tweet.fields":
					"created_at,public_metrics,non_public_metrics,in_reply_to_user_id",
			});
			if (payload?.startTime) {
				searchParams.append("start_time", payload.startTime);
			}
			if (payload?.endTime) {
				searchParams.append("end_time", payload.endTime);
			}
			return (await client(
				"GET",
				`users/${payload?.id}/tweets?${searchParams.toString()}`,
				null,
				accessToken,
			)) as XResponse<OwnPost[]>;
		}
	}

	return {
		status: 400,
		error: "存在しないアクションです",
	};
}
