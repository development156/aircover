/**
 * Every route a signed-in person can reach by navigating, in the order the rail
 * lists them. Dynamic segments are excluded — there is no row to put in them for
 * a workspace with nothing, and a fabricated id would photograph a 404 while
 * claiming to photograph the screen.
 *
 * ── WHY THIS IS NOT EXPORTED FROM A SPEC ─────────────────────────────────────
 * It was, and importing it from `ux-audit.spec.ts` silently REGISTERED the whole
 * j3 sweep inside the audit run: Playwright executes a spec's module body on
 * import, so every `test()` at its top level joins the importer's suite. The
 * audit run started by re-shooting 240 frames the reading agents were opening at
 * that moment, which is a corrupt read waiting to happen as well as seven wasted
 * minutes. A list of strings belongs in a module with no `test()` in it.
 */
export const ROUTES: string[] = [
  '/home',
  '/create',
  '/create/post',
  '/posts',
  '/posts/new',
  '/campaigns',
  '/planner',
  '/approvals',
  '/loop',
  '/playbooks',
  '/remix',
  '/studio',
  '/assets',
  '/sites',
  '/leads',
  '/inbox',
  '/inbox/comments',
  '/inbox/reviews',
  '/radar',
  '/analytics',
  '/report',
  '/brain',
  '/brain/identity',
  '/brain/voice',
  '/brain/audience',
  '/brain/competitors',
  '/brain/knowledge',
  '/brain/resolve',
  '/ads',
  '/ads/creative',
  '/ads/targeting',
  '/ads/budget',
  '/ads/performance',
  '/connections',
  '/wallet',
  '/settings',
  '/settings/profile',
  '/settings/plan',
  '/settings/integrations',
  '/design-system',
]
