'use client'

import { MoreVertical } from 'lucide-react'

import { FloatingPanel } from '@/components/assets/floating-panel'
import type { ContextMenuTrigger } from '@/components/assets/use-context-menu-trigger'

/**
 * THE "..." BUTTON'S OWN WIRING, ONCE. `FolderMenu`, `FileMenuBody` and
 * `SmartFolderMenu` each used to carry their own copy of "toggle open on
 * click, render `FloatingPanel` when open, ignore the trigger element on
 * outside-click" AND their own copy of the `MoreVertical` button markup —
 * near-identical bytes, three times over. `button` is still there for a
 * caller with a genuinely different trigger (`FilterChips`' own pill), but
 * every "..." trigger now shares ONE copy of that button's JSX too.
 */
export function MenuTrigger({
  trigger,
  ariaLabel,
  button,
  buttonClassName,
  panelClassName,
  children,
}: {
  trigger: ContextMenuTrigger
  ariaLabel: string
  /** Only for a trigger that is not a plain "..." button — `FilterChips`'
   *  pill is the one caller that still needs this. */
  button?: (onClick: (event: React.MouseEvent<HTMLButtonElement>) => void) => React.ReactNode
  /** The default "..." button's own classes, when `button` is absent. */
  buttonClassName?: string
  panelClassName?: string
  children: React.ReactNode
}) {
  const toggle = (event: React.MouseEvent<HTMLButtonElement>) =>
    trigger.open ? trigger.close() : trigger.openAtElement(event.currentTarget)

  return (
    <div className="relative">
      {button ? (
        button(toggle)
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={ariaLabel}
          aria-expanded={trigger.open}
          className={buttonClassName}
        >
          <MoreVertical size={14} aria-hidden />
        </button>
      )}
      {trigger.open && trigger.anchor ? (
        <FloatingPanel
          anchor={trigger.anchor}
          onClose={trigger.close}
          ariaLabel={ariaLabel}
          ignoreEl={trigger.triggerEl}
          className={panelClassName}
        >
          {children}
        </FloatingPanel>
      ) : null}
    </div>
  )
}
