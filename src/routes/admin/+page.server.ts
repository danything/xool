import { error } from "@sveltejs/kit";
import { adminUsers, isAdmin, summaryAdmin } from "$lib/server/admin";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies }) => {
	// 404 rather than 403: there is no reason to tell anyone this page is here.
	if (!isAdmin(cookies.get("key"))) error(404, "Not found");

	return { users: adminUsers(), summary: summaryAdmin() };
};
