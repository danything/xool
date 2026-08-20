/**
 * How long the cookie holding a session key lives, in seconds. Two weeks: long
 * enough that the daily summary keeps running for someone who does not visit,
 * short enough that an abandoned browser does not stay signed in forever.
 */
export const SESSION_MAX_AGE = 1209600;

/**
 * A UUIDv4 colliding is not something that happens, but `exists` asks the
 * database, and a database that answers "taken" to everything -- a broken
 * query, a table read as empty-but-matching -- would recurse until the stack
 * gives out. Bounded so that case surfaces as an error we can read instead of
 * a crash we have to guess at.
 */
const KEY_ATTEMPTS = 5;

export async function generateUniqueKey(
	exists: (key: string) => Promise<boolean>,
): Promise<string> {
	for (let i = 0; i < KEY_ATTEMPTS; i++) {
		const key = crypto.randomUUID();
		if (!(await exists(key))) return key;
	}
	throw new Error(
		`Could not mint an unused session key in ${KEY_ATTEMPTS} attempts`,
	);
}
