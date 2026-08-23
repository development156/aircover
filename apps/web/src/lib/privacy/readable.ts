import 'server-only'

import type { WorkspaceExport } from './export'

/**
 * The export as a page a person can open, sitting next to the JSON.
 *
 * ## Why both, rather than one or the other
 *
 * `data.json` is the evidence: every row exactly as it is stored, unreshaped,
 * because a transformation is a place for a mistake to hide and a place for
 * somebody later to argue the export was not what the system held. That file is
 * also, for a shop owner in Nagpur with a phone, unreadable.
 *
 * DPDP gives the right to a copy to the PERSON. A copy only a programmer can
 * open satisfies the letter and misses the point. So the archive carries a
 * summary page as well: what is in the file, what is not, why, and how many rows
 * of each. It is a table of contents, not a second copy of the data — a person
 * who wants a specific row is pointed at where it is.
 *
 * ## It is deliberately plain HTML
 *
 * No stylesheet link, no font, no script. It has to open from a folder on a
 * laptop with no network, in two years, in whatever browser exists then.
 *
 * ## The raw hex is deliberate, and it is the ONE place it is allowed
 *
 * CLAUDE.md's rule is that nothing in this codebase carries a raw colour — every
 * surface reads a token from `@sahoda/shared/tokens.css`. This file is not in
 * this codebase once it is written: it is a document in the customer's Downloads
 * folder with no stylesheet to import and no build step to inline one. Values,
 * not variables, is the only thing that renders. The rule is about drift inside
 * the app, and this page cannot drift because it is generated fresh every time.
 */

/**
 * ⚠ "Nothing was left out" is about RECORDS, and it used to be printed while a
 * warning about missing FILES sat directly above it. A customer reading the two
 * together learns that something is missing and that nothing is missing, in the
 * one document whose entire job is to let them tell an empty section from an
 * absent one. The empty state of the omissions table now reads
 * `payload.filesNotListed` before it says anything.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The one paragraph a customer is most likely to be looking for. */
const KEPT_NOTE = `Your credit and payment record is NOT deleted when you delete your workspace.
That is the account of what you paid and what you were charged. It is the only thing that can
settle a disagreement about a charge — in your favour as easily as ours — and Indian tax and
company law requires financial records to be kept for years regardless of anything else.
It contains a reference to you: for most rows a long code from our sign-in provider rather than
your name. We would rather say that than let you believe the record is anonymous when it is not.`

export function renderReadableExport(payload: WorkspaceExport): string {
  const withRows = payload.included.filter((t) => t.rows.length > 0)
  const empty = payload.included.filter((t) => t.rows.length === 0)
  const totalRows = payload.included.reduce((sum, t) => sum + t.rows.length, 0)
  const totalBytes = payload.files.reduce((sum, f) => sum + (f.bytes ?? 0), 0)

  const rowsTable = withRows
    .map(
      (t) =>
        `<tr><td>${escapeHtml(t.describes)}</td><td class="n">${t.rows.length}</td>` +
        `<td class="t">${escapeHtml(t.table)}${t.truncated ? ' <b>(shortened — see below)</b>' : ''}</td></tr>`,
    )
    .join('\n')

  const omitted = payload.notIncluded
    .map(
      (t) =>
        `<tr><td>${escapeHtml(t.describes)}</td><td>${escapeHtml(t.reason)}</td>` +
        `<td class="t">${escapeHtml(t.table)}</td></tr>`,
    )
    .join('\n')

  const truncatedNote = payload.included.some((t) => t.truncated)
    ? `<p class="warn">One or more sections reached this export's row limit, so they are
       SHORTENED. They are marked above. Ask Sahoda for the rest and we will send it.</p>`
    : ''

  const fileNote =
    payload.filesNotListed.length > 0
      ? `<p class="warn">Some of your files could not be listed: ` +
        payload.filesNotListed
          .map((f) => `${escapeHtml(f.bucket)}/${escapeHtml(f.prefix)} — ${escapeHtml(f.reason)}`)
          .join('; ') +
        `. They are not in this archive.</p>`
      : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your Sahoda data</title>
<style>
  body { font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         margin: 0 auto; max-width: 46rem; padding: 2rem 1.25rem 4rem; color: #17171a; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.15rem; margin: 2.25rem 0 .5rem; }
  p.lede { color: #5a5a63; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; margin-top: .5rem; }
  th, td { border-bottom: 1px solid #e4e4e8; padding: .45rem .5rem; text-align: left;
           vertical-align: top; font-size: .93rem; }
  th { font-weight: 600; color: #5a5a63; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.t { color: #85858f; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .82rem; }
  .warn { background: #fff6e8; border-left: 3px solid #e08a1e; padding: .6rem .8rem; }
  .kept { background: #f3f4f7; padding: .8rem 1rem; border-radius: 8px; white-space: pre-line; }
  code { background: #f3f4f7; padding: .1rem .3rem; border-radius: 4px; font-size: .88rem; }
</style>
</head>
<body>
<h1>Your Sahoda data</h1>
<p class="lede">Everything Sahoda holds about this workspace, as it stood on
${escapeHtml(payload.generatedAt.slice(0, 10))}.</p>

<h2>What is in this archive</h2>
<ul>
  <li><code>your-data.html</code> — this page.</li>
  <li><code>data.json</code> — every row, exactly as it is stored. This is the file to
      hand to a lawyer or a regulator. ${totalRows} rows in total.</li>
  <li><code>files/</code> — ${payload.files.length} of your pictures and documents
      ${payload.files.length > 0 ? `(${formatBytes(totalBytes)})` : ''}.</li>
</ul>
${truncatedNote}
${fileNote}

<h2>What Sahoda holds about you</h2>
<table>
  <thead><tr><th>What it is</th><th>How many</th><th>Where in data.json</th></tr></thead>
  <tbody>
${rowsTable || '<tr><td colspan="3">Nothing yet — this workspace has no saved work.</td></tr>'}
  </tbody>
</table>
${
  empty.length > 0
    ? `<p class="lede">${empty.length} other kinds of record were checked and you have none of them:
       ${escapeHtml(empty.map((t) => t.describes).join(', '))}.</p>`
    : ''
}

<h2>What is NOT in this archive, and why</h2>
<p class="lede">Listed by name. A section that was simply missing would leave you unable to tell
&ldquo;I have none of these&rdquo; from &ldquo;this was left out&rdquo;.</p>
<table>
  <thead><tr><th>What it is</th><th>Why not</th><th>Table</th></tr></thead>
  <tbody>
${
  omitted ||
  (payload.filesNotListed.length > 0
    ? '<tr><td colspan="3">No records were left out — but some of your FILES were, and they are named above.</td></tr>'
    : '<tr><td colspan="3">Nothing was left out.</td></tr>')
}
  </tbody>
</table>

<h2>If you delete your workspace</h2>
<p class="kept">${escapeHtml(KEPT_NOTE)}</p>

<h2>Questions</h2>
<p>Write to <b>support@sahodalabs.com</b>. If something here is wrong, or a section looks empty
that should not be, say so — an export that reads as complete and is not would be the worst
thing this file could do.</p>
</body>
</html>
`
}
