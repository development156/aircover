/**
 * A paid or rate-limited page source that answered with an HTTP status instead
 * of a page. Carries the status, the source's name and the endpoint — never
 * the key, never the vendor's prose (a vendor's sentence has no business on a
 * founder's screen; the status is enough to classify by).
 */
export class PageSourceError extends Error {
  constructor(
    readonly status: number,
    readonly source: string,
    readonly endpoint: string,
  ) {
    super(`${source} ${endpoint} failed with HTTP ${status}`)
    this.name = 'PageSourceError'
  }
}

/**
 * The statuses that mean "stop asking this vendor for the rest of the crawl":
 * out of funds (402), a feature the account is not enabled for (403), and a
 * rate limit (429). Anything else is one page's failure, and the next page is
 * still worth asking for.
 */
export function isVendorRefusal(error: unknown): error is PageSourceError {
  return (
    error instanceof PageSourceError &&
    (error.status === 402 || error.status === 403 || error.status === 429)
  )
}
