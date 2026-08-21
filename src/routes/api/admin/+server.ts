import { json } from "@sveltejs/kit";
import { isAdmin, setAdmin } from "$lib/server/admin";
import type { RequestHandler } from "./$types";

// 404 rather than 403, to match the page: someone who cannot see it has no
// reason to learn it is here.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const key = cookies.get("key");
	if (!isAdmin(key) || key === undefined) {
		return json({ error: "Not found" }, { status: 404 });
	}

	const { userKey, admin } = await request.json();
	if (typeof userKey !== "string" || typeof admin !== "boolean") {
		return json({ error: "userKeyとadminを指定してください" }, { status: 400 });
	}

	const error = setAdmin(userKey, admin, key);
	if (error !== undefined) return json({ error }, { status: 400 });
	return json({ ok: true });
};
