import { autoAction } from "$lib/server/client";
import db from "$lib/server/db";
import { get } from "$lib/server/lgtm";
import type { GhUser, User } from "$lib/server/model";
import { getSummary } from "$lib/server/summary";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const wkey = cookies.get("key");
	const message = cookies.get("message");

	// Two tools, one deployment: the hostname the request arrived on decides
	// which of them this page is.
	if (locals.site === "lgtm") {
		// Either sign-in is enough to upload. Having both is what ties them
		// together, so the page reports each one separately.
		const ghUser = wkey
			? db()
					.query<GhUser, [string]>("SELECT * FROM ghUser WHERE key = ?")
					.get(wkey)
			: null;
		const xUser = wkey
			? db().query<User, [string]>("SELECT * FROM user WHERE key = ?").get(wkey)
			: null;

		return {
			site: "lgtm" as const,
			message,
			wkey,
			isLoggedIn: ghUser !== null || xUser !== null,
			ghLogin: ghUser?.login,
			xLinked: xUser !== null,
			recentImages: get(1, false, wkey),
			myImages: wkey ? get(1, true, wkey) : [],
		};
	}

	if (message !== undefined || wkey === undefined) {
		return { site: "xool" as const, message, wkey };
	}

	const summary = getSummary(wkey);

	return {
		site: "xool" as const,
		message,
		wkey,
		summary: {
			enabled: summary?.enabled === 1,
			lastPostedAt: summary?.lastPostedAt ?? undefined,
			lastError: summary?.lastError ?? undefined,
		},
		keyInfo: autoAction("me", wkey),
	};
};
