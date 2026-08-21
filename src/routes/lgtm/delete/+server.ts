import { json } from "@sveltejs/kit";
import { accountExists } from "$lib/server/account";
import { deleteFile } from "$lib/server/lgtm";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userKey = cookies.get("key");
	if (!userKey || !accountExists(userKey)) {
		return json({ error: "ログインしてください" }, { status: 401 });
	}
	const { fileName } = await request.json();
	if (typeof fileName !== "string") {
		return json({ error: "fileNameを指定してください" }, { status: 400 });
	}
	const deleted = deleteFile(fileName, userKey);
	if (!deleted) {
		return json({ error: "削除できませんでした" }, { status: 403 });
	}
	return json({ ok: true });
};
