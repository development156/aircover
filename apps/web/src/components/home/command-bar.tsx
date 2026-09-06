import Link from 'next/link'
import type { Route } from 'next'
import { CalendarRange, Lightbulb, Megaphone, Sparkles, Timer } from 'lucide-react'

/**
 * THE COMMAND BAR — AND IT DOES EXACTLY WHAT IT LOOKS LIKE IT DOES.
 *
 * ── THE TRAP THIS AVOIDS ─────────────────────────────────────────────────────
 * The reference draws a wide field, a "Generate" button and four quick actions,
 * and the obvious build is a box wired to an AI call. There is no such call.
 * Nothing in this product turns arbitrary free text into anything: the ONE
 * action that accepts a written brief is Plan my week, which takes a week's
 * goals, costs credits, and reads them straight into its own prompt.
 *
 * A box that swallowed what you typed and opened a blank composer would be a
 * mock success — the failure this codebase forbids by name. So the field is
 * wired to the thing that is real: what you write here IS the week's goals, and
 * the button carries you to the planner with them already in the box.
 *
 * ── WHY IT IS A PLAIN GET FORM ───────────────────────────────────────────────
 * No client JavaScript, no `useState`, and the result is a shareable URL. /home
 * is the most visited route in the product and carries a JS budget; a hero that
 * shipped a state hook would spend from it to deliver something worse. The same
 * argument `PlannerToolbar` and `ViewToggle` already make for their own filters.
 *
 * ── THE BUTTON SAYS WHERE IT GOES, NOT "GENERATE" ────────────────────────────
 * "Generate" promises that pressing it makes something. Pressing this opens the
 * planner with your goals filled in; the making happens there, behind a second
 * press that states its own price. Labelling this one "Generate" would be a
 * promise the next screen has to break, and it would put a paid action one
 * keystroke from the top of the home page with no cost shown.
 */

/** A quick action. Every one is a route that exists today. */
const QUICK: readonly { href: Route; label: string; icon: typeof Timer }[] = [
  { href: '/planner', label: 'Plan my week', icon: CalendarRange },
  { href: '/brain', label: 'Find content ideas', icon: Lightbulb },
  { href: '/campaigns', label: 'Create a campaign', icon: Megaphone },
  { href: '/approvals', label: 'Review my drafts', icon: Timer },
]

export function CommandBar() {
  return (
    <section
      aria-labelledby="home-command"
      data-guide="home.command"
      className="surface-ring rounded-card bg-surface p-4 shadow-card narrow:p-5"
    >
      <h2 id="home-command" className="sr-only">
        Start something
      </h2>

      {/* A GET form to /planner. `goal` is the planner's own parameter, so the
          text lands in the goals field there rather than being read by anything
          here. */}
      <form action="/planner" className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="view" value="list" />
        <div className="surface-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-pill bg-surface px-4 transition-micro focus-within:shadow-[inset_0_0_0_1.5px_var(--brand)]">
          <Sparkles size={17} strokeWidth={1.9} aria-hidden className="flex-none text-accent" />
          <label htmlFor="home-goal" className="sr-only">
            What do you want to work on this week?
          </label>
          <input
            id="home-goal"
            name="goal"
            type="text"
            maxLength={500}
            /* The placeholder is a QUESTION the next screen actually answers.
               The reference's "What do you want to work on today?" promises a
               same-day result; what this opens is a week's plan, so the word is
               "week" and the screen it lands on is not a surprise. */
            placeholder="What do you want to work on this week?"
            className="h-11 w-full min-w-0 bg-transparent type-body text-ink outline-none placeholder:text-ink-mute"
          />
        </div>

        {/* BLACK, not orange, and that is the accent budget rather than a
            preference: docs/37 §16 allows one solid brand fill per view and the
            Create button above already spends it. The reference's own hero
            button is black for the same reason its Create button is not. */}
        <button
          type="submit"
          className="inline-flex h-11 flex-none items-center gap-2 rounded-pill bg-ink px-5 type-sm font-[650] text-canvas transition-micro hover:bg-primary hover:text-primary-foreground max-narrow:w-full max-narrow:justify-center"
        >
          Open the planner
        </button>
      </form>

      <ul className="mt-3 flex flex-wrap gap-2">
        {QUICK.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1.5 type-sm text-muted transition-micro surface-ring hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--line-firm)] max-narrow:min-h-11"
            >
              <Icon size={14} strokeWidth={1.9} aria-hidden className="flex-none text-ink-mute" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
