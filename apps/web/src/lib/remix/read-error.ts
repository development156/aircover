/**
 * A REMIX READ THAT FAILED, AS ITS OWN TYPE.
 *
 * `lib/remix/store.ts` used to destructure `data` alone from every batch and
 * derivative read and return `data ?? []`, so a query the database refused was
 * indistinguishable from "this workspace has never remixed anything". The
 * screen then rendered the free planner beside nothing, which is a claim about
 * the customer's history that nobody had checked.
 *
 * This is the type the store throws instead and the readers catch. It lives in
 * its own file rather than in `store.ts` because `read.ts` is `server-only` and
 * the tests that prove the catch mock the store wholesale; a class defined
 * inside the mocked module would never be the class the caller compares with.
 */
export class RemixReadError extends Error {
  constructor(readonly table: 'remix_batches' | 'remix_derivatives') {
    // A sentinel, never shown. The customer copy lives with the screen that
    // renders it, in `read.ts`.
    super(`REMIX_READ_FAILED:${table}`)
  }
}
