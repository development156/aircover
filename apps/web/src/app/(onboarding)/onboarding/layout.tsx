// Full-bleed shell for the Brand Brain setup flow — deliberately outside the
// (app) route group, so there is NO rail/topbar chrome around it.
//
// The stylesheet is imported HERE rather than in globals.css: it is 1,556 lines
// that only this route uses, and Next scopes a layout's CSS to the segment it
// belongs to. Loading it globally would put the whole onboarding stage in every
// other page's first paint.
import '@/styles/onboarding.css'

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-s1">{children}</div>
}
