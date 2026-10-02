import { isAdmin } from "#lib/server/admin.js";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ cookies }) => ({
	isAdmin: isAdmin(cookies.get("key")),
});
