import { json } from "@sveltejs/kit";
import { accountExists } from "$lib/server/account";
import { create } from "$lib/server/lgtm";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userKey = cookies.get("key");
	if (!userKey || !accountExists(userKey)) {
		return json({ error: "ログインしてください" }, { status: 401 });
	}
	const formData = await request.formData();
	const files = formData
		.getAll("files")
		.filter((f): f is File => f instanceof File);
	await create(files, userKey);
	return json({ ok: true });
};
