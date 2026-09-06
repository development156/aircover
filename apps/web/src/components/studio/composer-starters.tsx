import { PROMPT_STARTERS } from '@/lib/studio/prompt'

/**
 * SOMETHING TO TRY, FOR A BOX NOBODY KNOWS WHAT TO PUT IN.
 *
 * These FILL the prompt rather than generating, so nothing is spent by
 * trying one and the words can be edited first. Hidden once there is
 * something to edit, because then they are only in the way.
 */
export function ComposerStarters({
  visible,
  onPick,
}: {
  visible: boolean
  onPick: (text: string) => void
}) {
  if (!visible) return null

  return (
    <ul className="flex flex-wrap gap-2" data-guide="studio-starters">
      {PROMPT_STARTERS.map((starter) => (
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
