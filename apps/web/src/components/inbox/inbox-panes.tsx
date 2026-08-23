import { cn } from '@/lib/utils'

/**
 * The three-pane inbox shell (reference `.inbox`).
 *
 * ── RESPONSIVE, AND IT IS THE POINT ──────────────────────────────────────────
 *   >=1180   list | thread | context      three panes
 *   700-1179 list | thread                the context pane STEPS OUT
 *   <700     one pane                     list and thread SWAP
 *
 * Those are the reference's own breakpoints mapped onto this app's two
 * (`narrow` 700 / `wide` 1180). Mobile is a SWAP, not a squeeze: three columns
 * in 390px would give each about 130px, and the reference hides the list once a
 * thread is open rather than cramming both (SPECIFICATION.md §10 — "inbox swaps
 * list ↔ thread").
 *
 * ── FULL BLEED ───────────────────────────────────────────────────────────────
 * The panes carry their own headers and their own scroll. That is why this
 * escapes the page container: an inbox inside `p-page` under a page title has
 * two headers and two scrollbars, and the thread ends up scrolling the whole
 * document instead of its own column.
 */
export function InboxPanes({
  children,
  mobileShow,
  compact = false,
}: {
  children: React.ReactNode
  /**
   * Which single pane survives below 700px. The reference swaps list ⇄ thread
   * and never stacks them; stacking would put a full-height empty column above
   * the thing the user came to read.
   *
   * On this route nothing is ever selected, so the choice is driven by whether
   * there is a list worth showing: with conversations, the LIST is the screen;
   * with none, the THREAD pane is — because it is the pane carrying the reason
   * the inbox is empty, and hiding it on a phone would leave a new user with a
   * blank column and no explanation.
   */
  mobileShow: 'list' | 'thread'
  /**
   * Nothing in this inbox can be opened, so the panes stop claiming the viewport.
   *
   * MEASURED at 1440 on a workspace with no connection: the pane row was 790px
   * tall and held one 280px card, floated to dead centre. 72% of the screen was
   * white — the list column 288x730 with a single sentence in it, the context
   * column 292x740 with NOTHING in it below its header. Three columns of void
   * do not "show the reader what the inbox is"; they read as a screen that
   * failed to load, which is the opposite of the confidence §0 puts first.
   *
   * A fixed viewport height is right when there is a list to scroll — it is what
   * stops the thread scrolling the document. With nothing to scroll it is only
   * emptiness, held open. So the height becomes a floor rather than a lock, and
   * the object sizes to the one thing it actually contains.
   */
  compact?: boolean
}) {
  return (
    <div
      data-guide="inbox.panes"
      data-mobile-show={mobileShow}
      data-compact={compact || undefined}
      className={cn(
        `surface-ring group/panes grid min-h-0 overflow-hidden rounded-card bg-surface
         grid-cols-[288px_minmax(0,1fr)_292px]
         max-wide:grid-cols-[250px_minmax(0,1fr)]
         max-narrow:grid-cols-1`,
        compact
          ? 'min-h-[380px]'
          : `h-[calc(100dvh-var(--topbar-h)-2*var(--content-pad))]
             max-narrow:h-[calc(100dvh-var(--topbar-h)-140px)]`,
      )}
    >
      {children}
    </div>
  )
}

/**
 * One column. `min-h-0` on every level is load-bearing: a grid child defaults to
 * `min-height:auto`, so without it the scroll container grows to its content and
 * the pane never scrolls — the whole page does instead.
 */
export function InboxPane({
  kind,
  children,
  className,
}: {
  /** `context` hides below 1180; `list` hides below 700 when a thread is open. */
  kind: 'list' | 'thread' | 'context'
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      data-pane={kind}
      className={cn(
        'flex min-h-0 flex-col border-r border-line-soft last:border-r-0',
        /**
         * ── THE PANES SEPARATE BY FILL, NOT BY A LINE ─────────────────────────
         * docs/37 §1, mechanism 1, and it is the cheapest legibility this screen
         * can buy: two hairlines on one white rectangle read as a rectangle with
         * two lines in it, which is what an empty inbox looked like. A step of
         * fill under the two side panes makes "list | thread | context" visible
         * with no words at all — which matters most on the day-one screen, where
         * there are no rows to imply the structure.
         *
         * `--surface-2` is a 1.11:1 step in dark and 1.12:1 in light: chrome,
         * not separation, which is the correct weight for a column divider. The
         * THREAD keeps `--surface` because it is the pane that holds content.
         */
        kind !== 'thread' && 'bg-s2',
        // Context is the first pane the reference drops, at 1180.
        kind === 'context' && 'max-wide:hidden',
        // Below 700 exactly ONE of list/thread survives, chosen by the parent.
        kind === 'list' && 'max-narrow:group-data-[mobile-show=thread]/panes:hidden',
        kind === 'thread' && 'max-narrow:group-data-[mobile-show=list]/panes:hidden',
        className,
      )}
    >
      {children}
    </section>
  )
}

/** A pane's own fixed header (reference `.inbox__hd`). */
export function PaneHeader({ children }: { children: React.ReactNode }) {
  return <header className="flex-none border-b border-line-soft p-3">{children}</header>
}

/** A pane's own scroll region (reference `.inbox__scroll`). */
export function PaneScroll({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>{children}</div>
}
