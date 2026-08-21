/**
 * Where LGTM answers now that it is its own deployment. Only used to forward
 * the URLs this host used to serve; nothing else here knows LGTM exists.
 */
export const LGTM_ORIGIN = process.env.LGTM_ORIGIN ?? "https://l.doany.io";
