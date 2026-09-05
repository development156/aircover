import { Loader2, Sparkles } from 'lucide-react'

import { creditWord } from '@/lib/credit-words'
import { Textarea } from '@/components/ui/textarea'
import { promptHintFor } from '@/lib/studio/modes'
import type { GenerationMode } from '@sahoda/shared'

/**
 * THE PROMPT AND THE PRICED PRIMARY, ONE ROW.
 *
 * ── THREE LINES AT REST, NOT ONE ─────────────────────────────────────────
 * The founder's own complaint against an earlier build: a single-line box on
 * a screen whose entire purpose is describing a picture read as an
 * afterthought. `rows={3}` is what `Textarea`'s own `autoGrow` measures FROM
 * on an empty box, growing to roughly eight lines before it scrolls inside
 * itself instead of pushing the page around without limit.
 *
 * ── THE PRICE IS ON THE PRIMARY, AND THE BUTTON IS CUSTOM ────────────────
 * `Generate Image` carries the total as its own second line: the price and
 * the press are one decision. It is a CUSTOM button, not the shared
 * `Button`: inside `data-surface="inverse"` (the bar's own scope), `--ink`
 * IS white in light theme, so the shared button's `hover:bg-ink` would paint
 * white text on a white fill. `--pstrong`/`--pstrong-fg` is the pair the
 * scope solves for exactly this control, and it already flips correctly per
 * theme.
 *
 * While busy, the label itself names what is happening rather than staying
 * "Generate Image" as if nothing had been pressed, and `aria-busy` carries
 * the same fact to a screen reader. `pressLocked` (owned by `composer.tsx`)
 * is what actually stops a second spend; this visible state is what makes
 * that unnecessary to discover by trying it twice.
 */
export function ComposerPrompt({
  wanted,
  onChange,
  mode,
  ready,
  busy,
  total,
  onSubmit,
}: {
  wanted: string
  onChange: (next: string) => void
  mode: GenerationMode
  ready: boolean
  busy: boolean
  total: number
  onSubmit: () => void
}) {
  return (
    <div className="flex items-start gap-4">
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="sr-only">What should the picture show?</span>
        <Textarea
          value={wanted}
          autoGrow
          rows={3}
          maxRows={8}
          maxLength={1000}
          placeholder={promptHintFor(mode)}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter still inserts a newline, unchanged; Cmd/Ctrl+Enter is the
            // added keyboard submit, gated by the same `ready && !busy` the
            // button's own `disabled` enforces.
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              if (ready && !busy) onSubmit()
            }
          }}
          data-guide="studio-prompt"
          className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 type-h3 font-[400] shadow-none focus-visible:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!ready || busy}
        aria-busy={busy || undefined}
        data-guide="studio-generate"
        className={`inline-flex h-[56px] shrink-0 flex-col items-start justify-center gap-0 rounded-lg bg-primary px-5 text-primary-foreground transition-micro hover:bg-primary-strong hover:text-primary-strong-foreground active:translate-y-[0.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:shadow-[inset_0_0_0_1px_var(--line)] ${
          busy
            ? 'disabled:bg-primary/80 disabled:text-primary-foreground disabled:opacity-100'
            : 'disabled:bg-s2 disabled:text-muted disabled:opacity-100'
        }`}
      >
        <span className="flex items-center gap-1.5 type-sm font-[650]">
          {busy ? (
            <Loader2 className="size-[15px] animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-[15px]" aria-hidden />
          )}
          {busy ? 'Generating image…' : 'Generate Image'}
        </span>
        <span className="num type-sm font-[500] opacity-75">
          {total} {creditWord(total)}
        </span>
      </button>
    </div>
  )
}
