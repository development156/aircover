/**
 * Does the typed confirmation match the workspace's name?
 *
 * ## Why this is its own file
 *
 * Three places have to agree: the browser (which greys the button), the server
 * action (which refuses), and `public.erase_workspace` (which refuses again,
 * because the RPC is an addressable endpoint whatever either of the other two
 * does). The database's copy is SQL and cannot be shared; these two can be, and
 * a comparison written twice is a comparison that drifts — the screen enabling a
 * button the server then refuses, with no sentence that explains it.
 *
 * It cannot live in the action: a `'use server'` module may export only async
 * functions, and a sync export there fails the build rather than merely being
 * odd. (It did, on the first run.)
 *
 * ## Why it is forgiving
 *
 * Trimmed and case-insensitive, matching the SQL exactly
 * (`lower(btrim(…)) = lower(btrim(…))`). This is a name the customer is COPYING
 * BACK off the screen, not a password. A refusal on a trailing space is a dead
 * end with no message that could explain it, and the confirmation's job is to
 * make the person stop and read — which a trailing space does not test.
 */
export function eraseConfirmationMatches(typed: string, workspaceName: string): boolean {
  return typed.trim().toLowerCase() === workspaceName.trim().toLowerCase()
}
