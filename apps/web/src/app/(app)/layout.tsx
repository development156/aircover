import { Toaster } from 'sonner'

import { BottomNav } from '@/components/shell/bottom-nav'
import { Rail } from '@/components/shell/rail'
import { Topbar } from '@/components/shell/topbar'

/**
 * The app shell, in two mutually exclusive forms (SPECIFICATION.md §10).
 *
 * ≥768px  rail + topbar. The rail collapses to 64px icons at ≤1180px.
 * <768px  NO rail at all — bottom navigation with a dominant `+`.
 *
 * Mobile is RECOMPOSED, not shrunk. `max-narrow:hidden` on the rail is the
 * load-bearing half of that: without it the phone gets a 64px icon strip eating
 * a sixth of a 390px viewport, which is a squeezed desktop layout rather than
 * the mobile design.
 *
 * The `pb-[76px]` on <main> reserves the bottom bar's height plus breathing
 * room, because the bar is `fixed` and would otherwise sit on top of the last
 * row of every page — the classic version of this bug hides exactly one
 * control, the one at the end of the list, on exactly one device.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-[auto_1fr] max-narrow:grid-cols-1">
      <div className="max-narrow:hidden">
        <Rail />
      </div>
      <div className="flex min-w-0 flex-col">
        <Topbar />
        <main
          id="main"
          className="mx-auto w-full max-w-content p-page max-narrow:p-page-mobile max-narrow:pb-[76px]"
        >
          {children}
        </main>
      </div>
      <BottomNav />
      {/* Lifted clear of the bottom bar on a phone, or it covers the tabs. */}
      <Toaster position="bottom-left" offset={{ bottom: 16 }} mobileOffset={{ bottom: 72 }} />
    </div>
  )
}
