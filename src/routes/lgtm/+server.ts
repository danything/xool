import { redirect } from "@sveltejs/kit";
import { LGTM_ORIGIN } from "$lib/server/lgtm-origin";
import type { RequestHandler } from "./$types";

// LGTM used to live one level down from this hostname. Anyone still holding
// that link gets taken to where it went.
export const GET: RequestHandler = () => {
	redirect(308, `${LGTM_ORIGIN}/`);
};
