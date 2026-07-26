import { UserButton } from '@clerk/nextjs'

import { AdminSubNav } from '@/components/admin/sub-nav'
import { Rail } from '@/components/shell/rail'
import { requireOpsAdmin } from '@/lib/ops/guard'

export const metadata = { title: { template: '%s · Admin', default: 'Admin' } }

/**
 * Never prerendered, never cached. The whole segment is behind an authorization
 * check, and a cached admin page is a page that can be served to whoever asks
 * next. Middleware already refuses non-admins; this makes the refusal the
 * ONLY way in rather than the first of two.
 */
export const dynamic = 'force-dynamic'

/**
 * `/admin` shell (doc 13 §14).
 *
 * Deliberately NOT inside the `(app)` route group. That layout's Topbar reads
 * workspaces, the active workspace slug and a credit balance — tenant things —
 * and an ops admin is a PLATFORM role that need not own a workspace at all.
 * Rendering the tenant topbar here would make the console depend on a workspace
 * it has no reason to have, and doc 13 §14 says `/admin` ignores workspace
 * theming by design for the same reason.
 *
 * The rail stays, because an admin is also a user and needs the way back out.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Throws notFound() for everyone else. Middleware checks the same thing
  // earlier and cheaper; this is the check that is actually authoritative,
  // because it reads ops_admins through the caller's own JWT under RLS.
  const admin = await requireOpsAdmin()

  return (
    <div className="grid min-h-dvh grid-cols-[auto_1fr]">
      <Rail />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-5 flex h-topbar items-center gap-3 border-b border-line bg-s1/90 px-page backdrop-blur-[6px] max-narrow:px-page-mobile">
          <span className="text-[15px] font-extrabold tracking-[-0.01em]">Admin</span>
          <span className="rounded-pill bg-s2 px-2 py-[3px] font-mono text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            {admin.role}
          </span>
          <div className="ml-auto" />
          <div className="grid size-8 place-items-center">
            <UserButton />
          </div>
        </header>
        <AdminSubNav />
        <main className="mx-auto w-full max-w-content p-page max-narrow:p-page-mobile">
          {children}
        </main>
      </div>
    </div>
  )
}
