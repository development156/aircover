import type { Route } from 'next'
import { redirect } from 'next/navigation'

/**
 * The old create flow's address, kept alive as a redirect.
 *
 * ── WHY A REDIRECT AND NOT A DELETION ────────────────────────────────────────
 * NO DEAD ENDS applies to URLs, not only to buttons. This address is in the
 * `/create` chooser, in the phone shell's `+`, in `revalidatePath` calls, in
 * seven e2e specs and in whatever bookmarks and tour anchors exist outside the
 * repo. A 404 for any of them would be the product breaking, not the product
 * being tidied.
 *
 * There is now ONE screen for writing a post and it lives at `/posts/[id]`,
 * where the id `new` means the post does not exist yet. `?post=<id>` is carried
 * across so a half-finished flow someone left open lands on its own post rather
 * than on a blank one.
 */
export default async function LegacyCreatePostPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string }>
}) {
  const { post } = await searchParams
  // typedRoutes cannot narrow a template literal carrying a runtime id, so the
  // cast is made once, here. The route half is still a literal the manifest checks.
  redirect(post ? (`/posts/${post}` as Route) : '/posts/new')
}
