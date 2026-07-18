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
