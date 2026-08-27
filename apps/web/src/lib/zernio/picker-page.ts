import type { ZernioConnectChoice } from '@sahoda/publishing'

/**
 * THE PICKER, AS ONE SELF-CONTAINED HTML DOCUMENT.
 *
 * ── WHY IT IS NOT A REACT SCREEN ─────────────────────────────────────────────
 * It renders inside the OAuth popup, mid-redirect, on a route the browser reached
 * from facebook.com. A React page there means loading the whole app into a 620px
 * window — which is precisely the failure this flow was reported for twice
 * ("it opens a popup and it opens another new website"). The popup already ends on
 * a hand-written document for the same reason; this is its sibling.
 *
 * ── AND WHY IT HAS NO SCRIPT AND NO COLOUR ───────────────────────────────────
 * A form with radios and a submit button needs neither. No script means nothing to
 * fail with JavaScript blocked and no place for the token to be read from — the
 * token is not in this page at all, it is in an httpOnly cookie
 * (`lib/connections/pending-selection.ts`).
 *
 * No colour means no raw hex, which apps/web forbids, and no attempt to imitate
 * the design system from a file that cannot import `tokens.css`. A half-branded
 * page is worse than a plainly system-styled one; this reads as what it is, a
 * one-question step inside a sign-in window.
 */

/** What the page is asking about, in the customer's words rather than Zernio's. */
export interface PickerCopy {
  /** The channel as a person names it: "Facebook", "Google Business Profile". */
  channel: string
  /** Singular noun for one choice: "Page", "location". */
  noun: string
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
}

/**
 * Escape for both attribute and text position.
 *
 * `'` is escaped as well as `"`, which the closer page's version does not do — it
 * only ever interpolates a URL it built itself. This one interpolates a Page name
 * chosen by whoever owns the Facebook Page, which is third-party text arriving
 * through a third-party API. Both quote styles have to go.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&"'<>]/g, (c) => ESCAPES[c] ?? c)
}

const STYLE =
  `*{box-sizing:border-box}body{font:16px/1.5 system-ui,sans-serif;margin:0;` +
  `padding:24px;max-width:520px;margin-inline:auto}h1{font-size:1.15rem;margin:0 0 4px}` +
  `p{margin:0 0 16px}ul{list-style:none;margin:0 0 20px;padding:0}` +
  `li{margin:0 0 2px}label{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;` +
  `border:1px solid currentColor;border-radius:8px;cursor:pointer}` +
  `label span{display:block}small{display:block;opacity:.7}` +
  `button{font:inherit;padding:10px 18px;border-radius:8px;cursor:pointer;width:100%}`

function shell(title: string, body: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>` +
    `<body>${body}</body></html>`
  )
}

/**
 * The page the customer picks on.
 *
 * `action` is a same-origin path and `method` is POST, so the choice never rides a
 * URL. The only value submitted is an id that came out of `choices` — the page
 * offers no free-text field, and the route re-checks the id against the list it
 * fetches for itself rather than trusting this form. `ownerId` is deliberately not
 * a hidden field for the same reason: the route reads it off ITS list, so a submit
 * cannot pair one location's id with another location's owning account.
 */
export function pickerPage(
  copy: PickerCopy,
  choices: readonly ZernioConnectChoice[],
  options: { action: string; hasMore: boolean },
): string {
  const items = choices
    .map((choice, index) => {
      const detail = choice.detail ? `<small>${escapeHtml(choice.detail)}</small>` : ''
      return (
        `<li><label><input type="radio" name="choiceId" value="${escapeHtml(choice.id)}"` +
        `${index === 0 ? ' checked' : ''}>` +
        `<span>${escapeHtml(choice.name)}${detail}</span></label></li>`
      )
    })
    .join('')

  // Stated only when Zernio's own `hasMore` says so. A bounded list rendered as
  // "these are your locations" would be a claim we have no basis for.
  const more = options.hasMore
    ? `<p><small>Zernio returned only part of your list, so a ${escapeHtml(copy.noun)} you ` +
      `expect may be missing. Connect one now and connect the rest afterwards.</small></p>`
    : ''

  return shell(
    `Choose a ${copy.noun}`,
    `<h1>Choose a ${escapeHtml(copy.channel)} ${escapeHtml(copy.noun)}</h1>` +
      `<p>Sahoda posts to the one you pick. You can connect another later.</p>` +
      `<form method="post" action="${escapeHtml(options.action)}">` +
      `<ul>${items}</ul>${more}` +
      `<button type="submit">Connect this ${escapeHtml(copy.noun)}</button>` +
      `</form>`,
  )
}

/**
 * They approved, and there is nothing to pick.
 *
 * A real outcome and NOT an error, so it does not borrow the failure page. It also
 * does not say "connected", because nothing was: Zernio creates no account until a
 * choice is committed, so this customer has an approval at Facebook and no account
 * anywhere. The sentence says exactly that and names the remedy that can actually
 * work — `no-impossible-remedy.spec.ts` is the standing rule here. Reloading this
 * page cannot create a Page.
 */
export function nothingToPickPage(copy: PickerCopy, backHref: string): string {
  return shell(
    `No ${copy.noun} to connect`,
    `<h1>No ${escapeHtml(copy.channel)} ${escapeHtml(copy.noun)} came back</h1>` +
      `<p>${escapeHtml(copy.channel)} let Sahoda in, and then listed no ${escapeHtml(copy.noun)} ` +
      `for this account. Nothing was connected and nothing was charged.</p>` +
      `<p>Create or get access to a ${escapeHtml(copy.noun)} in ${escapeHtml(copy.channel)}, ` +
      `then connect again.</p>` +
      `<p><a href="${escapeHtml(backHref)}">Open Connections</a></p>`,
  )
}
