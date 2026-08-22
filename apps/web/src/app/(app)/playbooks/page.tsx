import Link from 'next/link'
import { ArrowRight, Lock } from 'lucide-react'
import {
  AUTONOMY_LEVELS,
  creditCost,
  MOVING_FESTIVALS_NOT_COVERED,
  type PlaybookRecipe,
} from '@sahoda/shared'

import { FestivalForm } from '@/components/playbooks/festival-form'
import { PlaybookKillSwitch } from '@/components/playbooks/kill-switch'
import { RunHistory } from '@/components/playbooks/run-history'
import { RunPreview } from '@/components/playbooks/run-preview'
import { PageTitle } from '@/components/page-title'
import { creditWord } from '@/lib/credit-words'
import { readPlaybooksSnapshot } from '@/lib/playbooks/read'
import { getActiveWorkspace } from '@/lib/workspaces'

export const metadata = { title: 'Playbooks' }

/**
 * PLAYBOOKS — recipes, and deliberately not a canvas.
 *
 * ── THE DECISION THIS SCREEN IS THE RESULT OF ────────────────────────────────
 * PRD §5.3 removed the node-based workflow canvas from v1 and replaced it with
 * this. The reasoning is worth keeping in the code, because a canvas is what
 * every reader's instinct reaches for when it reads "automation": people running
 * one shop do not build directed graphs, the canvas competes with Zapier and n8n
 * at high build cost, and the projected Starter-tier usage was near zero.
 *
 * So this screen is a LIBRARY, not an editor. There is no canvas, no node, no
 * connector and no dry-run console anywhere in it. The customer picks a recipe
 * and fills in three blanks; they cannot author one, and that is not a UI choice
 * — `playbooks.recipe_key` carries a CHECK constraint naming the five recipes
 * this product offers, so a sixth takes a migration.
 *
 * ── WHAT CHANGED FROM THE ROADMAP VERSION ────────────────────────────────────
 * wt-ia drew this page whole and said, correctly, that none of it was running:
 * no playbook stored, nothing watching, and "the switch on each card is a picture
 * of a switch". One of those five is now false. The festival calendar runs — it
 * opens a run, prices what it found, halts, charges on approval and writes drafts
 * — so it gets a real switch, a real form and a real price.
 *
 * The other four do not, and each says the ONE thing it waits on. A screen
 * understating what a product does is as wrong as one overstating it; it just
 * survives longer, because nobody complains about it.
 *
 * ── FIGURES ──────────────────────────────────────────────────────────────────
 * Every number here is a credit price out of pricing.config.json, a count of
 * rows, or a date out of a stored row. There are no run counts that are not
 * counts, no success rates, no time saved, no estimated reach. This screen has
 * therefore LEFT `e2e/roadmap-honesty.spec.ts` — the same way /loop and /report
 * left it when they were built — and the property that replaces it is narrower
 * and stronger: `components/playbooks/run-preview.test.tsx` asserts the
 * provenance of every digit the preview renders, and is verified by injecting a
 * fabricated figure.
 */

function Blocked({ recipe }: { recipe: PlaybookRecipe }) {
  return (
    <li className="is-proposed flex flex-col gap-3 rounded-card p-4">
      <div className="flex items-start gap-3">
        <Lock size={17} strokeWidth={1.8} aria-hidden className="mt-[3px] shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <h3 className="type-h3 text-ink">{recipe.name}</h3>
          <p className="type-eyebrow mt-1 text-muted">{recipe.group}</p>
        </div>
      </div>

      <dl className="grid gap-2">
        {(
          [
            ['When', recipe.when],
            ['Makes', recipe.makes],
            ['Lands in', recipe.lands],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="type-eyebrow w-[52px] shrink-0 pt-[3px] text-muted">{label}</dt>
            <dd className="type-sm min-w-0 text-muted">{value}</dd>
          </div>
        ))}
      </dl>

      {/* NAMED, not "coming soon". One sentence, one missing capability, in the
          reader's language — and rendered as a sentence rather than a disabled
          switch, because a disabled switch is a dead end in the costume of a
          control. */}
      <p className="type-body text-muted">Not running yet. It needs {recipe.blocker}.</p>
    </li>
  )
}

export default async function PlaybooksPage() {
  const workspace = await getActiveWorkspace()
  if (!workspace) {
    return (
      <div className="space-y-grid">
        <PageTitle sub="Small standing instructions: when this happens, write that. You fill in a few blanks and turn it on.">
          Playbooks
        </PageTitle>
        <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
          Finish setting up your workspace and your playbooks appear here.
        </p>
      </div>
    )
  }

  const snapshot = await readPlaybooksSnapshot(workspace.id)
  const ladder = AUTONOMY_LEVELS.find((l) => l.level === snapshot.level)

  return (
    <div className="space-y-grid">
      <PageTitle sub="Small standing instructions: when this happens, write that. You fill in a few blanks and turn it on.">
        Playbooks
      </PageTitle>

      <ul className="grid gap-3 wide:grid-cols-2">
        {snapshot.recipes.map(({ recipe, playbook, itemCredits }) => {
          if (recipe.blocker !== null) return <Blocked key={recipe.key} recipe={recipe} />

          const labels = Object.fromEntries(
            recipe.fields.map((f) => [f.name, { label: f.label, help: f.help }]),
          )
          const params = (playbook?.params ?? {}) as {
            channels?: string[]
            calendars?: string[]
            lead_days?: number
          }

          return (
            <li
              key={recipe.key}
              className="surface-ring flex flex-col gap-1 rounded-card bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="type-h3 text-ink">{recipe.name}</h3>
                  <p className="type-eyebrow mt-1 text-muted">{recipe.group}</p>
                </div>
                <span className="type-sm shrink-0 text-muted">
                  {playbook?.enabled ? 'On' : 'Off'}
                </span>
              </div>

              <dl className="mt-2 grid gap-2">
                {(
                  [
                    ['When', recipe.when],
                    ['Makes', recipe.makes],
                    ['Lands in', recipe.lands],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="type-eyebrow w-[52px] shrink-0 pt-[3px] text-muted">{label}</dt>
                    <dd className="type-sm min-w-0 text-muted">{value}</dd>
                  </div>
                ))}
              </dl>

              <FestivalForm
                playbookId={playbook?.id ?? null}
                enabled={playbook?.enabled ?? false}
                channels={params.channels ?? []}
                calendars={params.calendars ?? []}
                leadDays={params.lead_days ?? 7}
                cadence={playbook?.cadence ?? null}
                itemCredits={itemCredits ?? 0}
                runCredits={creditCost('playbook_run')}
                labels={labels}
              />

              {/* THE CALENDAR SAYS WHAT IT CANNOT SEE. A customer who never gets
                  a Diwali reminder has to learn that here, on the day they switch
                  it on — not in November. */}
              <p className="type-sm mt-3 text-muted">
                Fixed dates only. {MOVING_FESTIVALS_NOT_COVERED.join(', ')} move every year and
                Sahoda will not guess one, so they are not in this calendar yet.
              </p>
            </li>
          )
        })}
      </ul>

      {snapshot.liveRun ? (
        <RunPreview
          runId={snapshot.liveRun.id}
          items={snapshot.liveRun.items
            .filter((i) => i.included || i.outcome !== 'skipped')
            .map((i) => ({
              id: i.id,
              position: i.position,
              title: i.title,
              estimatedCredits: i.estimated_credits,
              channels: [...i.channels],
            }))}
          availableCredits={snapshot.availableCredits}
          approvedCredits={snapshot.liveRun.approved_credits}
        />
      ) : null}

      <RunHistory runs={snapshot.history} />

      <section aria-labelledby="pb-rules" className="surface-ring rounded-card bg-surface p-4">
        <h2 id="pb-rules" className="type-h3 text-ink">
          Two rules that will not change
        </h2>
        <ul className="mt-2 grid gap-2">
          <li className="type-body flex gap-2 text-muted">
            <ArrowRight size={15} strokeWidth={1.8} aria-hidden className="mt-[3px] shrink-0" />
            <span>
              A playbook never publishes around your{' '}
              <Link href="/loop" className="font-[550] text-accent underline underline-offset-2">
                autonomy setting
              </Link>
              . Yours is currently <span className="text-ink">{ladder?.name}</span> —{' '}
              {ladder?.may.toLowerCase()}
            </span>
          </li>
          <li className="type-body flex gap-2 text-muted">
            <ArrowRight size={15} strokeWidth={1.8} aria-hidden className="mt-[3px] shrink-0" />
            <span>
              You see what a run costs before it costs anything, and you approve it. A run costs{' '}
              <span className="num">{creditCost('playbook_run')}</span>{' '}
              {creditWord(creditCost('playbook_run'))}, plus whatever each draft costs on its own.
            </span>
          </li>
        </ul>
      </section>

      <PlaybookKillSwitch />
    </div>
  )
}
