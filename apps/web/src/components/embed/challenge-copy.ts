/**
 * The one sentence both embed forms and both public routes say when the bot
 * check (Cloudflare Turnstile) never produced a token.
 *
 * ── WHY IT IS ITS OWN SENTENCE ───────────────────────────────────────────────
 * MEASURED 2026-09-02 in a browser against the production build: with the
 * widget unable to load (an ad blocker, a corporate proxy, or the challenge
 * host blocked) the form posted `turnstile_token: ''`, the route answered the
 * generic "Please check the details and try again", and the visitor re-checked
 * details that were already right. Re-checking cannot work; the token is not
 * something they typed. So the missing token gets a sentence that names the
 * real failure and the one remedy that can help.
 *
 * No 'use client' and no React: the routes import it on the server, the forms
 * import it in the browser, and it must render inside somebody else's page, so
 * it names nothing about our stack.
 */
export const CHALLENGE_MISSING_MESSAGE =
  'The check that keeps bots out could not load. Nothing was sent. Turn off any ad blocker for this page, or try another browser.'

/** The `error` value the routes answer with, so a client can tell it apart. */
export const CHALLENGE_MISSING_ERROR = 'challenge_missing'
