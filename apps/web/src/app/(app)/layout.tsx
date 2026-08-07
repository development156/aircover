import { Toaster } from 'sonner'

import { Rail } from '@/components/shell/rail'
import { Topbar } from '@/components/shell/topbar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-[auto_1fr]">
      <Rail />
      <div className="flex min-w-0 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-content p-page max-narrow:p-page-mobile">
          {children}
        </main>
      </div>
      {/* docs/08 §6 toast spec (--ink bg, r-input, 4s, one action) — styling pass later */}
      <Toaster position="bottom-left" />
    </div>
  )
}
