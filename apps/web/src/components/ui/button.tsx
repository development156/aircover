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
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-pill font-semibold transition-micro active:scale-[.97] disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-strong hover:text-white',
        secondary:
          'border-[1.5px] border-ink bg-transparent text-ink hover:bg-ink hover:text-white',
        ghost: 'text-muted hover:bg-s2 hover:text-ink',
        destructive: 'bg-danger text-white hover:brightness-95',
      },
      size: {
        default: 'px-4 py-[9px] text-[14px]',
        sm: 'px-3 py-[6px] text-[13px]',
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
