/**
 * A minimal fetch-shaped HTTP port. Payment adapters depend on this instead of calling the
 * network directly, so tests replay RECORDED fixtures and never hit a live payment rail.
 * Production wires {@link fetchTransport}.
 *
 * Mirrors `packages/publishing/src/transport.ts` deliberately by COPY, not import: billing
 * depending on publishing would couple two unrelated domains for a ~40-line port. Promotion
 * of the shared shape to @sahoda/shared is filed in REQUESTS.md.
 *
 * The repo has no HTTP dependency and adds none — global `fetch` behind an injected port.
 */
export interface TransportRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

export interface TransportResponse {
  status: number
  headers: Record<string, string>
  /** Raw response body text; adapters JSON-parse as needed. */
  body: string
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>

/** A recorded HTTP response. `body` is authored as JSON. */
export interface RecordedResponse {
  status: number
  headers?: Record<string, string>
  body?: unknown
}

/** Replay a single recorded response regardless of the request. */
export function fixtureTransport(recorded: RecordedResponse): Transport {
  return async () => ({
    status: recorded.status,
    headers: recorded.headers ?? {},
    body: recorded.body === undefined ? '' : JSON.stringify(recorded.body),
  })
}

/** A single route for {@link routedTransport}: match by method and/or URL substring. */
export interface FixtureRoute {
  match: { method?: string; urlIncludes: string }
  response: RecordedResponse
}

/**
 * Route each request to a recorded response — required for multi-call flows (create-order
 * then get-order reconciliation) where the blind single-response {@link fixtureTransport}
 * would silently replay the wrong fixture. An unmatched request THROWS, so a missing fixture
 * fails loudly rather than quietly returning a plausible default.
 */
export function routedTransport(routes: FixtureRoute[]): Transport {
  return async (req) => {
    const route = routes.find(
      (r) =>
        (r.match.method === undefined || r.match.method === req.method) &&
        req.url.includes(r.match.urlIncludes),
    )
    if (!route) {
      throw new Error(`no fixture route matched ${req.method} ${req.url}`)
    }
    return fixtureTransport(route.response)(req)
  }
}

/**
 * Node's global `fetch` has NO default timeout, so a stalled upstream hangs forever. Without a
 * deadline a webhook handler holding an open socket is killed by the platform, Cashfree marks
 * the delivery failed and redelivers, and each redelivery opens another hanging socket.
 */
const DEFAULT_TIMEOUT_MS = 15_000

export interface FetchTransportOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** Production transport backed by the platform's global `fetch`, with a hard deadline. */
export function fetchTransport(opts: FetchTransportOptions | typeof fetch = {}): Transport {
  // Accept a bare fetch for backward compatibility with the publishing-style call shape.
  const { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } =
    typeof opts === 'function' ? { fetchImpl: opts } : opts

  return async (req) => {
    const res = await fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })
    return { status: res.status, headers, body: await res.text() }
  }
}
