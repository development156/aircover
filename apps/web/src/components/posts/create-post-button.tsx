'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

import { createPost } from '@/app/actions/posts'
import { InlineError } from '@/components/posts/inline-error'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Creates an empty draft, then routes into the editor. `createPost` costs no
 * credits (it is a plain insert), so there is deliberately no cost line here —
 * showing one would be a fabricated price.
 *
 * The action never throws; it returns a discriminated union, so the failure
 * path is a real inline banner rather than an unhandled rejection.
 */
export interface CreatePostButtonProps {
  size?: 'default' | 'sm'
  className?: string
}

export function CreatePostButton({ size = 'default', className }: CreatePostButtonProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onCreate() {
    setError(null)
    startTransition(async () => {
      // Untitled by design: the editor is where a title gets written, and an
      // empty title renders as "Untitled post" everywhere.
      const result = await createPost('')
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.push(`/posts/${result.postId}`)
    })
  }

  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <Button
        type="button"
        size={size}
        loading={pending}
        onClick={onCreate}
        data-guide="posts.create"
      >
        {pending ? null : <Plus size={16} strokeWidth={2} aria-hidden />}
        {/* Buttons keep their name through the flow — verb stays "create". */}
        {pending ? 'Creating post…' : 'Create post'}
      </Button>

      {error ? <InlineError>{error} Nothing was created — try again.</InlineError> : null}
    </div>
  )
}
