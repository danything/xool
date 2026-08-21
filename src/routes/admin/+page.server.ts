import { error } from "@sveltejs/kit";
import {
	adminUsers,
	isAdmin,
	lgtmAdmin,
	summaryAdmin,
} from "$lib/server/admin";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies, locals }) => {
	// 404 rather than 403: there is no reason to tell anyone this page is here.
	if (!isAdmin(cookies.get("key"))) error(404, "Not found");

	// The user list is the same on both hostnames: an account is one account,
	// whichever of the two tools it arrived through.
	const users = adminUsers();
	return locals.site === "lgtm"
		? { site: "lgtm" as const, users, lgtm: lgtmAdmin() }
		: { site: "xool" as const, users, summary: summaryAdmin() };
};
