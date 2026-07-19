/**
 * A minimal fetch-shaped HTTP port. Adapters depend on this instead of calling the
 * network directly, so tests replay RECORDED fixtures and never touch live X/Google
 * (a hard rule while real credentials do not exist). Production wires {@link fetchTransport}.
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

/** A recorded HTTP response, as stored in `./fixtures/**`. `body` is authored as JSON. */
export interface RecordedResponse {
  status: number
  headers?: Record<string, string>
  body?: unknown
}

/**
 * Replay a single recorded response regardless of the request — the backbone of the
 * adapter fixture tests. Multi-call flows can compose several of these later.
 */
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
 * Route each request to a recorded response — required for multi-call flows (OAuth
 * token exchange + profile fetch, GBP account/location discovery) where the blind
 * single-response {@link fixtureTransport} would silently replay the wrong fixture.
 * An unmatched request throws so a missing fixture fails loudly, never confusingly.
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

/** Production transport backed by the platform's global `fetch`. */
export function fetchTransport(fetchImpl: typeof fetch = fetch): Transport {
  return async (req) => {
    const res = await fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    })
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })
    return { status: res.status, headers, body: await res.text() }
  }
}
