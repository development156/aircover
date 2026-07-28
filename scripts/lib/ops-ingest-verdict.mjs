/**
 * What a non-2xx from the ingest endpoint MEANS — permanent or transient.
 *
 * WHY THIS EXISTS. On 2026-07-26 the sync spent hours POSTing to :3000, a
 * different worktree's dev server with no ingest route. It answered 404, the
 * sync printed one grey warning line and exited 0, and the board simply stopped
 * moving. Nothing was lost — the queues only drain on an ack — but nobody
 * noticed for hours, because a permanent misconfiguration was rendered in
 * exactly the same voice as a dev server that happened to be restarting.
 *
 * That was the third silent-success failure in one day (an empty migration
 * recorded as applied, a placeholder token treated as configured, this). The
 * common shape is a config error wearing the costume of a transient one. So the
 * distinction is made structurally here rather than left to whoever reads the
 * scrollback: a `permanent` verdict cannot be fixed by trying again, and is
 * printed as a block that cannot be mistaken for noise.
 *
 * Pure function, no I/O — ops-ingest-verdict.test.mjs pins every branch.
 */

/** A body that opens like a web page rather than an API response. */
function looksLikeHtml(body) {
  return /^\s*(?:<!doctype html|<html\b)/i.test(String(body ?? ''))
}

const FIX_URL = [
  'Point OPS_INGEST_URL at the dev server for THIS worktree:',
  '  echo "OPS_INGEST_URL=http://localhost:<port>" >> ops/.local.env',
  '(that file is gitignored — every worktree shares one root .env but not one port)',
]

/**
 * @returns {{permanent: boolean, headline: string, lines: string[]}}
 */
export function ingestVerdict({ status, body = '', url = '' }) {
  const snippet = String(body ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)

  if (status === 404) {
    return {
      permanent: true,
      headline: `the ingest endpoint is not there — 404 from ${url}`,
      lines: looksLikeHtml(body)
        ? [
            'Something IS listening on that port, and it served an HTML page.',
            'That is another app — most likely a different worktree whose',
            'checkout has no /api/admin/devops/ingest route.',
            ...FIX_URL,
          ]
        : [
            'Nothing at that path answers as the ingest route.',
            'Either the URL is wrong or this checkout has not built the route.',
            ...FIX_URL,
          ],
    }
  }

  if (status === 401 || status === 403) {
    return {
      permanent: true,
      headline: `the ingest endpoint rejected the token — ${status} from ${url}`,
      lines: [
        'DEVOPS_INGEST_TOKEN does not match the one the server is checking.',
        'Retrying cannot fix this. Compare the value in .env against the',
        'server process that is actually running.',
      ],
    }
  }

  // A 4xx that is not auth and not 429 is the server refusing THIS payload —
  // zod rejected it, or the route disagrees with the contract. Sending the same
  // bytes again produces the same answer.
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
    return {
      permanent: true,
      headline: `the ingest endpoint refused the payload — ${status} from ${url}`,
      lines: [
        'The server understood the request and rejected it, so the next sync',
        'will send the same bytes and be rejected again.',
        snippet ? `Server said: ${snippet}` : 'The server gave no reason.',
      ],
    }
  }

  // 429 and every 5xx: the endpoint is real and the payload may be fine. The
  // queues stay on disk and go again, which is what makes a restarting dev
  // server a delay rather than a hole in the record.
  return {
    permanent: false,
    headline: `ingest ${status} at ${url}${snippet ? ` — ${snippet}` : ''}`,
    lines: [],
  }
}

/**
 * The loud block. Reserved for `permanent` — if everything shouts, nothing does.
 *
 * Deliberately multi-line and rule-delimited: the failure it replaces was
 * invisible precisely because it was one line the same shape as every other
 * line of tool output.
 */
export function formatPermanent(verdict) {
  const rule = '━'.repeat(64)
  return [
    '',
    rule,
    'ops: CONFIG ERROR — the dashboard is NOT being updated.',
    `      ${verdict.headline}`,
    '',
    ...verdict.lines.map((line) => `      ${line}`),
    '',
    'Nothing was lost: state files keep their queue and replay once this is fixed.',
    rule,
    '',
  ].join('\n')
}
