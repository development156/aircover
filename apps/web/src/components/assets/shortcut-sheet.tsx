'use client'

import { LIBRARY_SHORTCUTS } from '@/components/assets/library-shortcuts'
import { Modal } from '@/components/ui/modal'

/**
 * F5 — every shortcut this screen actually implements, and nothing else.
 *
 * Built from `LIBRARY_SHORTCUTS`, the same array the handlers and the menu
 * items themselves import their key literals from (`use-library-shortcuts.ts`,
 * `folder-menu.tsx`, `file-menu-body.tsx`) — this sheet cannot say a key
 * works that the handlers do not also check for, because there is only one
 * spelling of each key in the codebase, not two that could drift apart.
 *
 * ── `Modal`, NOT A HAND-ROLLED PORTAL ─────────────────────────────────────
 * `Modal` is built on the native `<dialog>` + `showModal()`, which the
 * browser promotes to the TOP LAYER — a stronger guarantee than a manual
 * `createPortal` to `document.body`, because a top-layer element is immune
 * to an ancestor's `backdrop-filter`, `transform` or `overflow` even when it
 * is MOUNTED deep inside one, which is exactly the class of bug B1 and
 * `apps/web/CLAUDE.md`'s `backdrop-filter` note both describe. Reusing it
 * also gets a real focus trap and Escape-to-close for free, rather than a
 * third hand-rolled copy of both in this folder.
 */
export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2.5">
        {LIBRARY_SHORTCUTS.map((entry) => (
          <div key={entry.id} className="contents">
            <dt>
              <kbd className="surface-ring-firm inline-block rounded-sm bg-s2 px-2 py-0.5 type-meta font-semibold text-ink">
                {entry.keys}
              </kbd>
            </dt>
            <dd className="type-sm text-ink-body">{entry.description}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
