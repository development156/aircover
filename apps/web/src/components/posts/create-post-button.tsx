import Link from 'next/link'
import { Plus } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The primary "Create post" action, on Home and /posts.
 *
 * ── IT USED TO INSERT A ROW BEFORE ASKING ANYTHING ───────────────────────────
 * This button called `createPost('')`, wrote an empty draft, and routed into the
 * editor with its id. Every press produced a row, so an abandoned click left an
 * "Untitled post" in the list forever and the workspace accumulated debris from
 * people who changed their mind on the first screen.
 *
 * It now opens the create flow instead, and nothing is written until the flow
 * has something to write. `createPost` is unchanged and still used by the flow's
 * own final step; only the moment of insertion moved.
 *
 * ── WHY A LINK AND NOT A BUTTON ──────────────────────────────────────────────
 * The destination is known ahead of time now, so this is a navigation and should
 * be a real anchor: middle-click, open-in-new-tab, and the browser's own status
 * bar preview all work, none of which a `<button onClick={router.push}>` gives.
 * That also drops the transition state and the inline error, because there is no
 * longer a server call here that can fail.
 */
export interface CreatePostButtonProps {
  size?: 'default' | 'sm'
  className?: string
}

export function CreatePostButton({ size = 'default', className }: CreatePostButtonProps) {
  return (
    <Link
      href="/posts/new"
      data-guide="posts.new_button"
      className={cn(buttonVariants({ variant: 'primary', size }), className)}
    >
      <Plus size={16} strokeWidth={2} aria-hidden />
      {/* The verb stays "create" the whole way through the flow. */}
      Create post
    </Link>
  )
}
