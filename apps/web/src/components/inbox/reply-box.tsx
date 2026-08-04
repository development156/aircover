'use client'

import { useState, useTransition } from 'react'
import { ExternalLink, Save } from 'lucide-react'

import { draftReply } from '@/app/actions/inbox'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { InlineError } from '@/components/posts/inline-error'

/**
 * Compose a reply, save it, and open the platform to post it.
 *
 * ── WHY THIS SAVES AND DOES NOT SEND ─────────────────────────────────────────
 * There is no verified write API for Google Business Profile replies available to
 * us. FSD M7's honesty rule is explicit about what to do then: "channels lacking
 * write APIs show 'reply opens app/site' affordance instead of fake sends."
 *
 * So the button says Save, the copy says where it goes, and the link takes the
 * customer to the platform with their words already on the clipboard-friendly
 * screen behind them. A "Send" button that quietly only wrote a database row
 * would be the single most damaging lie this product could tell — the customer
 * would believe they had answered an unhappy review, and they would not have.
 */
export function ReplyBox({ threadId, permalink }: { threadId: string; permalink: string | null }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await draftReply({ thread_id: threadId, body })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSaved(true)
    })
  }

  return (
    <div className="space-y-2">
      <Textarea
        rows={3}
        value={body}
        placeholder="Write your reply — I'll keep it here for you."
        onChange={(event) => {
          setBody(event.target.value)
          setSaved(false)
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending || body.trim() === ''}>
          <Save size={14} aria-hidden />
          {pending ? 'Saving…' : 'Save reply'}
        </Button>
        {permalink ? (
          <a
            href={permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-input px-2 py-1 text-[12.5px] font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ExternalLink aria-hidden className="size-3.5" />
            Open on the platform to post it
          </a>
        ) : null}
      </div>
      <p className="text-[12px] text-muted">
        Saving keeps your reply here. Posting it still happens on the platform — we can&rsquo;t
        send replies for this channel yet, and we won&rsquo;t pretend to.
      </p>
      {error !== null ? <InlineError>{error}</InlineError> : null}
      {saved ? (
        <p className="text-[12.5px] text-ok">Saved here. It has not been posted yet.</p>
      ) : null}
    </div>
  )
}
