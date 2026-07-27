import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardLabel } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface BrandCardProps {
  title: string
  guide: string
  full?: boolean
  onRegenerate: () => void
  regenerateDisabled: boolean
  regenerateCost: number
  children: React.ReactNode
}

/**
 * Shared shell for every Refine card (Voice, Brand persona, Customer persona,
 * Hook, Taboo, Signal Lock). There's no per-field regenerate endpoint — every
 * card's Regenerate re-runs the whole resolve, which the server charges as a new,
 * visible spend, which is why the affordance is identical everywhere.
 */
export function BrandCard({
  title,
  guide,
  full,
  onRegenerate,
  regenerateDisabled,
  regenerateCost,
  children,
}: BrandCardProps) {
  return (
    <Card data-guide={guide} className={cn('flex flex-col gap-3', full && 'sm:col-span-2')}>
      <div className="flex items-center justify-between gap-2">
        <CardLabel className="mb-0">{title}</CardLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          disabled={regenerateDisabled}
          className="shrink-0"
        >
          <RefreshCw size={13} aria-hidden />
          {/* One span = one flex item, so the button's gap-2 applies once
              (icon | label) instead of around every fragment of the sentence. */}
          <span>
            Regenerate · Uses <span className="tabular-nums">{regenerateCost}</span> credits
          </span>
        </Button>
      </div>
      {children}
    </Card>
  )
}
