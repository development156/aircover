import type { PromptStarter } from '@/lib/studio/prompt'

/**
 * SOMETHING TO TRY, FOR A BOX NOBODY KNOWS WHAT TO PUT IN.
 *
 * These FILL the prompt rather than generating, so nothing is spent by
 * trying one and the words can be edited first. Hidden once there is
 * something to edit, because then they are only in the way.
 *
 * `starters` is resolved by the caller (`composer.tsx`), through the
 * three-step ladder in `lib/studio/starter-ladder.ts`: stored ideas a model
 * wrote for this exact Brand Brain version, brand words folded into generic
 * frames, or the five generic ideas, in that order. This component renders
 * whichever list it is handed and does not know which step produced it.
 */
export function ComposerStarters({
  visible,
  starters,
  onPick,
}: {
  visible: boolean
  starters: readonly PromptStarter[]
  onPick: (text: string) => void
}) {
  if (!visible) return null

  return (
    <ul className="flex flex-wrap gap-2" data-guide="studio-starters">
      {starters.map((starter) => (
        <li key={starter.prompt}>
          {/* The chip SHOWS the subject and its tooltip carries the sentence the
              box is about to get, so five sit on one line and a person can still
              read the whole thing before pressing. See `PromptStarter`. */}
          <button
            type="button"
            title={starter.prompt}
            onClick={() => onPick(starter.prompt)}
            className="surface-ring rounded-pill bg-s2 px-3 py-1 text-left type-sm text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {starter.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
