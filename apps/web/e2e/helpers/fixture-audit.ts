/**
 * READS A PLAYWRIGHT SPEC AND ASKS ONE QUESTION: does every test that opens a
 * protected page actually request the signed-in fixture?
 *
 * The rule and the evidence behind it are documented on
 * `signed-in-fixture.test.ts`, which is also where it is executed against the
 * real suite. The analysis lives here, apart from that sweep, for one reason:
 * a rule whose only input is a directory of files that currently PASS can never
 * be shown to fire. These functions take a string, so the positive cases —
 * "this source is broken and the rule says so" — are ordinary tests.
 */

/**
 * The routes `middleware.ts` serves without a session.
 *
 * A test that only ever opens one of these needs a browser and no account,
 * which is what the five detector self-tests in this suite do: they load
 * /sign-in because it is the one page a signed-out visitor can render, then
 * replace its body with `setContent` and measure their own instrument against
 * known markup. Minting a Clerk user there would create an account per run to
 * look at a page that is thrown away.
 *
 * Kept short and literal rather than derived from `middleware.ts`: this is a
 * list of what a TEST may open without signing in. It is not the security
 * boundary and must not start looking like one.
 */
export const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/design-system', '/embed/']

export interface TestCase {
  name: string
  params: string
  body: string
}

/**
 * What the seeded `test` is CALLED in this file.
 *
 * It is not always `test`. `onboarding-walk.spec.ts` imports Playwright's own
 * `test` for its detector work and the seeded one as `seeded`, so a rule that
 * only looks for `test(` reads that file as having no tests at all. Returns
 * null when the fixture is not imported.
 */
export function seededTestName(source: string): string | null {
  const clause = source.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/fixtures\/seeded-user'/)
  if (!clause) return null
  for (const part of clause[1]!.split(',')) {
    const m = part.trim().match(/^test(?:\s+as\s+(\w+))?$/)
    if (m) return m[1] ?? 'test'
  }
  return null
}

/**
 * Every `<testName>(...)` call, with its parameter list and its body.
 *
 * The body is the text up to the next such call — coarse on purpose. A precise
 * brace match would buy nothing this rule can use, and the failure mode of the
 * coarse version is over-inclusion, which errs toward flagging.
 */
export function testCases(source: string, testName: string): TestCase[] {
  const found: { name: string; params: string; at: number }[] = []
  const re = new RegExp(
    String.raw`\b${testName}(?:\.only|\.skip)?\(\s*(['"\x60])([\s\S]*?)\1\s*,\s*async\s*\(([\s\S]*?)\)\s*=>`,
    'g',
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    found.push({ name: m[2]!, params: m[3]!, at: m.index + m[0].length })
  }
  return found.map((f, i) => ({
    name: f.name,
    params: f.params,
    body: source.slice(f.at, found[i + 1]?.at ?? source.length),
  }))
}

/**
 * Local `async function name(...)` bodies, so a test that navigates THROUGH A
 * HELPER is not read as a test that never navigates.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * MEASURED by mutation: `signedIn` was deleted from
 * `prefers-reduced-motion never mounts it at all`, which is the exact defect
 * this rule was written for, and the rule stayed GREEN. That test does not
 * contain the string `goto` — it calls `createWorkspace(page)`, and so do most
 * of the tests worth guarding. A rule that only sees literal navigation would
 * have passed the very failure it was built after.
 */
export function helperBodies(source: string): Map<string, string> {
  const bodies = new Map<string, string>()
  const re = /\basync\s+function\s+(\w+)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    // To the next top-level `}` at column zero. These files declare helpers at
    // module scope, so that is where each one ends.
    const rest = source.slice(m.index)
    const end = rest.search(/\n\}/)
    bodies.set(m[1]!, end === -1 ? rest : rest.slice(0, end))
  }
  return bodies
}

/** Every path this source opens with `.goto('/…')`. */
export function gotoPaths(body: string): string[] {
  return [...body.matchAll(/\.goto\(\s*['"`](\/[^'"`$]*)/g)].map((m) => m[1]!)
}

/**
 * Does this test open a PROTECTED application URL — directly, or through one of
 * the file's own helpers? That is the only case that breaks without a session.
 */
export function opensProtectedPage(body: string, helpers: Map<string, string>): boolean {
  let text = body
  for (const [name, helperBody] of helpers) {
    if (new RegExp(String.raw`\b${name}\s*\(`).test(body)) text += '\n' + helperBody
  }
  return gotoPaths(text).some((path) => !PUBLIC_PREFIXES.some((p) => path.startsWith(p)))
}

/** Names of the tests in this source that open a protected page without the fixture. */
export function testsMissingTheFixture(source: string): string[] {
  const testName = seededTestName(source)
  if (testName === null) return []
  const helpers = helperBodies(source)
  return testCases(source, testName)
    .filter((t) => opensProtectedPage(t.body, helpers))
    .filter((t) => !/\bsignedIn\b/.test(t.params))
    .map((t) => t.name)
}
