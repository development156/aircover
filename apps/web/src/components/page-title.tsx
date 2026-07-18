// Page h1 per docs/08 §3 (25/32, 800) — one owner for the type-scale value.
export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">{children}</h1>
}
