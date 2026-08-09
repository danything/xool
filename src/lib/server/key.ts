/**
 * How long the cookie holding a session key lives, in seconds. Two weeks: long
 * enough that the daily summary keeps running for someone who does not visit,
 * short enough that an abandoned browser does not stay signed in forever.
 */
export const SESSION_MAX_AGE = 1209600;

export async function generateUniqueKey(
	exists: (key: string) => Promise<boolean>,
): Promise<string> {
	const key = crypto.randomUUID();
	return (await exists(key)) ? generateUniqueKey(exists) : key;
}
