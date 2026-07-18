import { CreditChip } from '@/components/shell/credit-chip'

export function Topbar() {
  return (
    <header
      data-guide="topbar"
      className="sticky top-0 z-5 flex h-topbar items-center gap-3 border-b border-line bg-s1/90 px-page backdrop-blur-[6px] max-narrow:px-page-mobile"
    >
      {/* Workspace switcher goes live with workspace bootstrap (wt-db RPC) */}
      <button
        type="button"
        disabled
        data-guide="topbar.workspace"
        title="Workspaces arrive with the bootstrap flow"
        className="flex items-center gap-2 rounded-input border border-line bg-bg px-3 py-[7px] font-semibold disabled:opacity-45"
      >
        <span aria-hidden className="size-[9px] rounded-pill bg-primary" />
        <span className="text-muted">No workspace yet</span>
      </button>
      <div className="ml-auto" />
      <CreditChip credits={null} />
      {/* CLERK SLOT (step 3): <UserButton /> replaces this placeholder */}
      <div
        data-guide="topbar.avatar"
        aria-hidden
        className="grid size-8 place-items-center rounded-pill bg-ink text-[13px] font-semibold text-white"
      >
        ·
      </div>
    </header>
  )
}
