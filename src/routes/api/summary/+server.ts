import { json } from "@sveltejs/kit";
import { getSummary, postToday, setEnabled } from "$lib/server/summary";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userKey = cookies.get("key");
	if (!userKey) {
		return json({ error: "ログインしてください" }, { status: 401 });
	}
	const { enabled } = await request.json();
	if (typeof enabled !== "boolean") {
		return json({ error: "enabledを指定してください" }, { status: 400 });
	}

	// Only the very first enable posts on the spot, and it reports today so far
	// rather than a day that ended before anyone was watching. Toggling off and
	// on again later does not repost -- that first run recorded a date.
	const first = getSummary(userKey)?.lastSummarizedOn == null;
	setEnabled(userKey, enabled);
	const posted = enabled && first ? await postToday(userKey) : false;

	const summary = getSummary(userKey);
	return json({
		enabled: summary?.enabled === 1,
		posted,
		error: summary?.lastError ?? undefined,
	});
};
