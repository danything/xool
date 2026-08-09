import { json } from "@sveltejs/kit";
import { getSummary, postToday } from "$lib/server/summary";
import type { RequestHandler } from "./$types";

// Asking for one on the spot. The automatic first post only happens once, so
// without this the only way to see a summary again is to wait for midnight.
export const POST: RequestHandler = async ({ cookies }) => {
	const userKey = cookies.get("key");
	if (!userKey) {
		return json({ error: "ログインしてください" }, { status: 401 });
	}
	if (getSummary(userKey) === null) {
		return json({ error: "先に自動ポストをONにしてください" }, { status: 400 });
	}

	const posted = await postToday(userKey);
	const summary = getSummary(userKey);
	return json({ posted, error: summary?.lastError ?? undefined });
};
