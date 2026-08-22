import { expect, test } from './fixtures/seeded-user'

/**
 * NO SURFACE MAY OFFER A REMEDY IT CANNOT FULFIL.
 *
 * ── THE BUG CLASS ────────────────────────────────────────────────────────────
 * A read returns one empty value for BOTH "this broke" and "there is nothing
 * here", the UI branches on that single value, and a brand-new user is told
 * something failed when nothing did. It has shipped four times:
 *
 *   run 9   /analytics       "couldn't read" with no account connected
 *   run 9   /home Instagram  the same, in a second component
 *   run 22  /connections     "couldn't check your connections", no workspace
 *   run 23  the topbar       "Create workspace" over a workspace that exists
 *
 * The tell is always the REMEDY. "Reload", "try again", "refresh" can only fix a
 * transient failure — so on an account where no read has failed, every one of
 * those words is a false diagnosis attached to an action that cannot succeed.
 *
 * ── WHY THIS IS NOT A GREP ───────────────────────────────────────────────────
 * A grep proves a string is present in the source; it cannot tell which branch
 * rendered. This asserts a property of ACCOUNT STATE × RENDERED TEXT: the
 * fixture account has a live session and a healthy database, and simply has no
 * workspace yet. Nothing about it has failed, so nothing may claim it has. The
 * same words are correct on a genuinely broken read and are not asserted against
 * there — which is why the state, not the string, is what this test fixes.
 *
 * A failure here therefore means one of exactly two things, and both are worth
 * knowing: a surface is lying about a non-failure, or the database really is
 * down for the run.
 */

/**
 * The words that promise a retry can help. Evaluated in the page against
 * rendered text, so a sentence assembled from three spans is still caught.
 */
const DETECTOR = `(() => {
  const RE = /\\breload\\b|\\btry again\\b|\\brefresh\\b|could ?n[o']?t (read|check|load|reach)|could not (read|check|load|reach)/i
  const hits = []
  const isHidden = (e) => {
    const cs = getComputedStyle(e)
    return cs.display === 'none' || cs.visibility === 'hidden'
  }
  for (const e of document.querySelectorAll('body *')) {
    if (isHidden(e)) continue
    // Own text only: without this, every ancestor up to <body> reports the same
    // sentence and one defect arrives as forty.
    const own = Array.from(e.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(' ')
      .replace(/\\s+/g, ' ')
      .trim()
    if (!own || !RE.test(own)) continue
    hits.push({ tag: e.tagName, text: own.slice(0, 160) })
  }
  return hits
})()`

/**
 * Every in-scope route a brand-new account can reach. /onboarding and admin/**
 * are out of scope for this run and are deliberately absent.
 *
 * `/brain/*` was out of scope too, because those screens were coming-soon
 * placeholders with nothing to read and therefore nothing to misreport.
 * `/brain/audience` is no longer one: it reads a workspace, a connection and a
 * live platform call, which is exactly the shape that produced all four historic
 * failures. Added 2026-08-20 by the audience lane. The other three /brain
 * sub-routes stay out until they read something.
 */
const ROUTES = [
  '/home',
  '/posts',
  '/planner',
  '/create',
  '/posts/new',
  '/connections',
  '/inbox',
  '/inbox/comments',
  '/inbox/reviews',
  '/analytics',
  '/brain/audience',
  '/sites',
  '/wallet',
  '/approvals',
  '/assets',
  '/campaigns',
  '/settings',
  '/settings/plan',
  '/settings/integrations',
  '/settings/profile',
  // Added run 27, and each of these reads something on this branch:
  //
  //   /loop, /report   six Loop tables. Both resolved the workspace with the
  //                    LOSSY `getActiveWorkspace()` and printed "Finish setting
  //                    up your workspace" whether the account had none or the
  //                    read had failed. Fixed at the reader (`readLoop`), and
  //                    the query-error arm — which no e2e run can produce — is
  //                    pinned in `src/lib/loop/read.test.ts`. What THIS asserts
  //                    is the half a browser can: a healthy fresh account is
  //                    never told to retry.
  //   /brain,          `readBrain()`, four-way from the start. Here to keep it
  //   /brain/resolve   that way, and because the resolution console renders a
  //                    queue whose emptiness has two meanings of its own.
  //
  // The other /brain sub-routes (identity, voice, competitors) are still
  // 16-31 line placeholders that read nothing, so they stay out.
  '/loop',
  '/report',
  '/brain',
  '/brain/resolve',
]

test.describe('no impossible remedy on a healthy new account @smoke', () => {
  /**
   * The detector must be able to FAIL. A guard that silently stops detecting
   * reports green forever — which is the same failure mode as the bug it hunts.
   * Three fixtures: the sentence this run deleted, the sentence that replaced
   * it, and a control that contains the word "read" without promising anything.
   */
  test('the detector itself still detects', async ({ page }) => {
    await page.goto('/sign-in')
    const found = (await page.evaluate(`(() => {
      const host = document.createElement('div')
      host.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'
      host.innerHTML =
        '<p id="d-bad">Couldn\\u2019t check your connections just now \\u2014 reload to see what\\u2019s already linked.</p>' +
        '<p id="d-bad2">Reload to try again.</p>' +
        '<p id="d-good">Channels belong to a workspace and you don\\u2019t have one yet. Nothing failed.</p>' +
        '<p id="d-control">Read the guide</p>'
      document.body.appendChild(host)
      const hits = ${DETECTOR}
      host.remove()
      return hits
    })()`)) as Array<{ text: string }>

    expect(found.some((h) => h.text.includes('reload to see'))).toBe(true)
    expect(found.some((h) => h.text.includes('Reload to try again'))).toBe(true)
    expect(found.some((h) => h.text.includes('Nothing failed'))).toBe(false)
    expect(found.some((h) => h.text.includes('Read the guide'))).toBe(false)
  })

  for (const route of ROUTES) {
    test(`${route} offers no remedy it cannot fulfil`, async ({ page, signedIn }) => {
      expect(signedIn).toBeTruthy()
      await page.goto(route)
      await page.waitForLoadState('networkidle')

      const hits = (await page.evaluate(DETECTOR)) as Array<{ tag: string; text: string }>
      const report = hits.map((h) => `  <${h.tag}> "${h.text}"`).join('\n')

      expect(
        hits,
        `${route} promises a retry to an account where nothing has failed.\n` +
          `This account has a live session and a healthy database — it simply has no\n` +
          `workspace yet, so "reload" cannot produce one. Say which of the two it is.\n${report}`,
      ).toEqual([])
    })
  }
})
