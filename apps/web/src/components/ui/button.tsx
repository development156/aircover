import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

// shadcn/ui Button, restyled per Design System §6 (the only four variants the
// spec defines). Global `:focus-visible` (globals.css) already ships the 2px
// --acc ring — this component only needs hover/active/disabled/loading.
// Exported so a plain <Link> can wear the button's clothes. `<Button asChild>` is NOT
// the route for that: Button always renders a loading-spinner slot beside {children},
// so Radix's Slot receives two children and throws — and it forwards `disabled`, which
// is not a valid attribute on an anchor. Filed in REQUESTS.md; the asChild path needs
// its own review rather than a drive-by fix from a feature branch.
export const buttonVariants = cva(
  // An INSET RING, never a border. A border changes the box size, so a hover
  // that thickens the edge shifts the layout by a pixel; an inset shadow paints
  // inside the box and never reflows. `active` nudges half a pixel down rather
  // than scaling — a scale on text is a re-raster, and it reads as a wobble.
  'inline-flex shrink-0 items-center justify-center gap-[6px] rounded-sm leading-none font-[550] transition-micro active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Rationed to ONE per view. Hovers to BLACK, not to a darker orange:
        // orange is the resting state, black is the commitment.
        primary:
          'bg-primary text-primary-foreground hover:bg-ink hover:text-white disabled:bg-line disabled:text-white disabled:opacity-100',
        // The workhorse — white with a hairline ring.
        secondary: 'surface-ring-firm bg-surface text-ink hover:bg-s2',
        ghost: 'text-muted hover:bg-surface-3 hover:text-ink',
        // ⚠ There is NO red in this palette. Destructive is solid INK, and it
        // reads as dangerous because it is solid and because it says "Delete" —
        // not because of hue (RETHEME.md §5). Mapping it to --danger would make
        // it identical to primary, since --danger is now the brand orange.
        destructive: 'bg-ink text-white hover:bg-primary',
      },
      size: {
        default: 'h-control px-3 text-[13px]',
        sm: 'h-7 px-[9px] text-[12px] [&_svg]:size-[13px]',
        lg: 'h-10 px-4 text-[14px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Button-level micro-loading (docs/08 §6): disables + shows a small spin icon. */
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
      {children}
    </Comp>
  )
})
