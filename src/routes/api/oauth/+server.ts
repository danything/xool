import { redirect } from "@sveltejs/kit";
import { callbackUrl } from "$lib/server/oauth";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ url, cookies }) => {
	cookies.delete("message", { path: "/" });

	const params = new URLSearchParams({
		response_type: "code",
		client_id: process.env.CLIENT_ID ?? "",
		// encodeURIComponent, by way of URLSearchParams: encodeURI leaves ?, =
		// and & alone, which is exactly wrong for something going into a query
		// value.
		redirect_uri: callbackUrl(url.origin),
		scope: "tweet.read tweet.write users.read offline.access",
		state: process.env.HASH ?? "",
		code_challenge: "challenge",
		code_challenge_method: "plain",
	});

	redirect(302, `https://x.com/i/oauth2/authorize?${params.toString()}`);
};
