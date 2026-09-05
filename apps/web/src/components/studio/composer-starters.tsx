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
        <li key={starter}>
          <button
            type="button"
            onClick={() => onPick(starter)}
            className="surface-ring rounded-pill bg-s2 px-3 py-1 text-left type-sm text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {starter}
          </button>
        </li>
      ))}
    </ul>
  )
}
