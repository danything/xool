import db from "./db";

/**
 * Whether the key in the cookie still names an account. A key outlives the row
 * it was minted for -- a deleted account leaves a cookie behind -- and nothing
 * else on the way in checks.
 */
export function accountExists(userKey: string): boolean {
	return (
		db()
			.query<{ key: string }, [string]>("SELECT key FROM user WHERE key = ?")
			.get(userKey) !== null
	);
}
