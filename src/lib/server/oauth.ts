/**
 * Where x.com is told to come back to, and the same string again when the code
 * is exchanged -- x.com compares the two and refuses if they differ, so they
 * are built in one place rather than written out twice.
 *
 * The trailing "?redirect=" is vestigial. Signing in used to be able to send
 * you on to LGTM afterwards and this parameter carried where; LGTM has its own
 * site now and nothing sets it. It stays in the string only because what is
 * registered in the developer portal has to match it character for character,
 * and editing that is a separate job from editing this.
 */
export const callbackUrl = (origin: string) => `${origin}/api/cb?redirect=`;
