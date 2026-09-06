/**
 * THE SKELETON IS THE PAGE'S OWN SHAPE, NOT A SPINNER.
 *
 * A spinner says "wait"; this says "a verdict, then three numbers, then two
 * posts". The layout does not jump when the real thing arrives, which is the
 * only reason a skeleton is worth drawing at all.
 */
export default function Loading() {
  return (
    <div className="space-y-grid" aria-busy>
      <div className="h-7 w-40 animate-pulse rounded-input bg-surface-2" />
      <div className="flex w-full max-w-[760px] flex-col gap-6">
        <div className="space-y-2">
          <div className="h-3 w-56 animate-pulse rounded-input bg-surface-2" />
          <div className="h-8 w-48 animate-pulse rounded-input bg-surface-2" />
          <div className="h-5 w-full max-w-[52ch] animate-pulse rounded-input bg-surface-2" />
        </div>
        <div className="grid gap-3 wide:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface-ring h-[92px] animate-pulse rounded-card bg-surface" />
          ))}
        </div>
        <div className="grid gap-3 wide:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="surface-ring h-[118px] animate-pulse rounded-card bg-surface" />
          ))}
        </div>
        <div className="h-[104px] animate-pulse rounded-card bg-brand-wash" />
        <div className="surface-ring h-[140px] animate-pulse rounded-card bg-surface" />
        <div className="surface-ring h-[112px] animate-pulse rounded-card bg-surface" />
      </div>
    </div>
  )
}
