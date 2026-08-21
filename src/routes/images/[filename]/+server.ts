import { redirect } from "@sveltejs/kit";
import { LGTM_ORIGIN } from "$lib/server/lgtm-origin";
import type { RequestHandler } from "./$types";

// LGTM served from this hostname before it had its own, and the markdown it
// hands you embeds whatever origin you copied it from -- so pull requests out
// there still point at x.doany.io/images. The pictures moved; the URLs cannot.
export const GET: RequestHandler = ({ params }) => {
	redirect(308, `${LGTM_ORIGIN}/images/${encodeURIComponent(params.filename)}`);
};
