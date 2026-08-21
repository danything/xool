import db from "./db";

/**
 * Whether the key in the cookie still names an account.
 *
 * A key is minted by signing in, but linking two sign-ins retires one of them:
 * `adopt` moves everything to the surviving key and the old one stops naming
 * anybody. A tab opened before that keeps sending it, and nothing else checks,
 * so an upload from that tab used to land on a key no account owns -- images
 * belonging to nobody, and a row in the admin list with no identity in it.
 *
 * Checking it also means the cookie has to have been issued by us. Without
 * this, any value at all was a working identity for uploading.
 */
export function accountExists(userKey: string): boolean {
	return (
		db()
			.query<{ key: string }, [string, string]>(
				"SELECT key FROM user WHERE key = ? UNION SELECT key FROM ghUser WHERE key = ?",
			)
			.get(userKey, userKey) !== null
	);
}
