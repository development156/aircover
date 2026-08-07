// Full-bleed shell for the Brand Brain setup flow — deliberately outside the
// (app) route group, so there is NO rail/topbar chrome around it.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-s1">{children}</div>
}
