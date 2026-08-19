'use client'

import { cn } from '@/lib/utils'

/**
 * A TILE is a selectable thing. A CARD is a container.
 *
 * The distinction is not cosmetic and it is the one this app kept blurring:
 * a card holds content and is not itself an answer to a question; a tile IS an
 * option, so it must be a real control, must show selection, and must be
 * reachable by keyboard. `/create/post`'s channel grid is the canonical use.
 *
 * `disabled` means "this real option is temporarily unavailable" — something
 * the user could fix. It must NEVER mean "coming soon": a disabled button is
 * still announced as a button, so it offers an action that does not exist. Use
 * the coming-soon treatment (a span) for that.
 *
 * Selection is carried by `aria-pressed` AND by a visible ring AND by weight —
 * three signals, because the palette has one colour and a tint alone is close
 * to invisible against the surface it sits on (see docs/26 §3.1).
 */
export function Tile({
  selected = false,
  disabled = false,
  onClick,
  title,
  meta,
  icon,
  className,
}: {
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  title: string
  meta?: string
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-16 w-full items-center gap-2.5 rounded-card border px-3 py-3 text-left transition-micro',
        'max-narrow:min-h-[44px]',
        selected
          ? 'border-brand bg-brand-wash ring-1 ring-brand'
          : 'border-line hover:border-line-firm hover:bg-s2',
        disabled && 'cursor-not-allowed opacity-45 hover:border-line hover:bg-transparent',
        className,
      )}
    >
      {icon ? <span className="flex-none">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn('block truncate text-[13px]', selected ? 'font-semibold' : 'font-medium')}
        >
          {title}
        </span>
        {meta ? <span className="type-sm block truncate text-muted">{meta}</span> : null}
      </span>
    </button>
  )
}
