import { redirect } from "@sveltejs/kit";
import db from "$lib/server/db";
import { accessToken, githubUser } from "$lib/server/github";
import { generateUniqueKey, SESSION_MAX_AGE } from "$lib/server/key";
import { adopt } from "$lib/server/link";
import type { GhUser, User } from "$lib/server/model";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get("code");
	if (process.env.HASH !== url.searchParams.get("state") || !code) {
		cookies.set("message", "不正なリクエストです", { path: "/" });
		redirect(302, "/");
	}

	const token = await accessToken(code, `${url.origin}/api/gh/cb`);
	const user = token === undefined ? undefined : await githubUser(token);
	if (user === undefined) {
		cookies.set("message", "GitHubの認証に失敗しました", { path: "/" });
		redirect(302, "/");
	}

	// Signing in with GitHub while already signed in with x.com is what links
	// the two: the x.com key wins and the GitHub sign-in becomes another door
	// into the same account, images and all.
	const current = cookies.get("key");
	const signedInWithX =
		current !== undefined &&
		db()
			.query<User, [string]>("SELECT * FROM user WHERE key = ?")
			.get(current) !== null;

	const existing = db()
		.query<GhUser, [string]>("SELECT * FROM ghUser WHERE githubId = ?")
		.get(user.id);

	let key: string;
	if (existing !== null) {
		key = signedInWithX && current !== undefined ? current : existing.key;
		// adopt() repoints the ghUser row, so only the login has to be written.
		if (key !== existing.key) adopt(key, existing.key);
		db().run("UPDATE ghUser SET login = ? WHERE githubId = ?", [
			user.login,
			user.id,
		]);
	} else if (signedInWithX && current !== undefined) {
		key = current;
		// This x.com account may have been linked to a different GitHub account
		// before. The images stay where they are; only the door changes.
		db().run("DELETE FROM ghUser WHERE key = ? AND githubId != ?", [
			key,
			user.id,
		]);
		db().run("INSERT INTO ghUser (key, githubId, login) VALUES (?, ?, ?)", [
			key,
			user.id,
			user.login,
		]);
	} else {
		key = await generateUniqueKey(
			async (k) =>
				db()
					.query<GhUser, [string]>("SELECT * FROM ghUser WHERE key = ?")
					.get(k) !== null,
		);
		db().run("INSERT INTO ghUser (key, githubId, login) VALUES (?, ?, ?)", [
			key,
			user.id,
			user.login,
		]);
	}

	cookies.set("key", key, { path: "/", maxAge: SESSION_MAX_AGE });
	redirect(302, "/");
};
