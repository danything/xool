import { autoAction } from "$lib/server/client";
import { getSummary } from "$lib/server/summary";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies }) => {
	const wkey = cookies.get("key");
	const message = cookies.get("message");

	if (message !== undefined || wkey === undefined) return { message, wkey };

	const summary = getSummary(wkey);

	return {
		message,
		wkey,
		summary: {
			enabled: summary?.enabled === 1,
			lastPostedAt: summary?.lastPostedAt ?? undefined,
			lastError: summary?.lastError ?? undefined,
		},
		// Resolved here rather than streamed to the browser. The call takes about
		// 150ms, and a streamed promise only ever lands if the page hydrates --
		// which it does not during a rollout, when the HTML and the chunks it
		// asks for can come from two different pods and one of them 404s. The
		// account panel then sat on its loading skeleton forever.
		keyInfo: await autoAction("me", wkey).catch(() => ({
			error: "アカウント情報を取得できませんでした",
		})),
	};
};
