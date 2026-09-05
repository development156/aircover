import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * ONE HISTORY LIST, NOT TWO.
 *
 * The artboard (`Compose.dc.html`) draws exactly one "Made earlier" strip,
 * inside the composer. This screen used to render a SECOND one below the
 * workbench — `RecentGenerations`, "What you have made" — so a person made a
 * picture and saw it appear twice, in two different visual languages.
 *
 * `StudioWorkbench` owns the strip that survives: it is the one the artboard
 * draws, it already carries the shape-and-age caption the artboard asks for,
 * and it is covered by `studio-workbench.test.tsx`'s own `data-guide=
 * "studio-strip"` tests. `RecentGenerations` was left as a component until 2026-09-05, when it was deleted — nothing
 * else in the app imports it, and deleting a working component is a bigger
 * change than the one this screen asked for — but this screen must not render
 * it.
 *
 * A full render of `StudioPage` is not practical here: it is an async server
 * component that reads the workspace, the wallet, the Brand Brain and two
 * Supabase tables in parallel, and mocking all five just to look at whether
 * one import line exists would be a heavier guard than the claim it checks.
 * This asserts the claim directly, against the file the claim is about.
 *
 * WHAT IT CANNOT SEE: it reads ONE file as text, so every route to a second
 * history list that does not spell `RecentGenerations` in `page.tsx` is
 * invisible to it. A re-export under another name, a dynamic
 * `import(...)` built from a variable, a barrel file that pulls it in, a child
 * component that renders it, or a second strip written from scratch rather
 * than imported would all pass. It also cannot see whether the strip that DOES
 * survive renders correctly — that is `studio-workbench.test.tsx`'s job. This
 * closes the door that was actually found open, and says so rather than
 * implying a wider guarantee.
 */
describe('the Studio page renders one history list, not two', () => {
  test('does not import or render RecentGenerations', () => {
    const source = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/RecentGenerations/)
  })
})
