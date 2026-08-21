import { redirect } from "@sveltejs/kit";
import { action, client } from "$lib/server/client";
import db from "$lib/server/db";
import { generateUniqueKey, SESSION_MAX_AGE } from "$lib/server/key";
import type { User } from "$lib/server/model";
import { recordUserRead } from "$lib/server/spend";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get("code");
	const redirectParam = url.searchParams.get("redirect") ?? "";
	if (process.env.HASH !== url.searchParams.get("state") || !code) {
		cookies.set("message", "不正なリクエストです", { path: "/" });
		redirect(302, "/");
	}
	const params = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		code_verifier: "challenge",
		redirect_uri: `${url.origin}/api/cb?redirect=${redirectParam}`,
	});
	const data = await client("POST", "oauth2/token", params.toString());
	if (data.error === "invalid_request") {
		redirect(302, `/api/oauth?redirect=${redirectParam}`);
	}

	const user = await action("me", data.access_token);
	if (user.status === 429) {
		cookies.set(
			"message",
			"API利用上限に達しましたしばらく経ってから再試行してください",
			{ path: "/" },
		);
		redirect(302, "/");
	}
	const existUser = db()
		.query<User, [string]>("SELECT * FROM user WHERE socialId = ?")
		.get(user.data.id);

	let key: string;
	if (existUser !== null) {
		key = existUser.key;
		db().run(
			"UPDATE user SET accessToken = ?, refreshToken = ? WHERE socialId = ?",
			[data.access_token, data.refresh_token, user.data.id],
		);
	} else {
		key = await generateUniqueKey(
			async (k) =>
				db()
					.query<User, [string]>("SELECT * FROM user WHERE key = ?")
					.get(k) !== null,
		);
		db().run(
			"INSERT INTO user (key, socialId, accessToken, refreshToken) VALUES (?, ?, ?, ?)",
			[key, user.data.id, data.access_token, data.refresh_token],
		);
	}

	// The users/me above is billed like every other read. It is only written
	// down here because until now there was no key to write it against.
	recordUserRead(key);
	cookies.set("key", key, { path: "/", maxAge: SESSION_MAX_AGE });
	redirect(302, `/${redirectParam}`);
};
