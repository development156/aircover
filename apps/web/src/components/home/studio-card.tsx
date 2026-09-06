import { ArrowRight, Palette } from 'lucide-react'

/**
 * THE STUDIO BOX — AND WHAT YOU TYPE IN IT REACHES STUDIO.
 *
 * ── THE COPY IS NOT THE COPY THAT WAS ASKED FOR, AND THE FOUNDER RE-ASKED ────
 * The brief's words are "Studio — Chat with Sahoda. Plan, create and get things
 * done", and a "chat box". Studio does not chat: its page subtitle is "Describe
 * a picture and Sahoda draws it, using what it knows about your brand", its
 * reads are `readGenerations` and `readLibraryPictures`, and its action is
 * `queueGeneration`. It draws pictures.
 *
 * The founder repeated the request after that was raised, so the SHAPE is built
 * exactly as asked — a prominent box at the top of Home that opens Studio. What
 * is not built is the false sentence. A box promising a conversation that opens
 * a drawing tool sends somebody somewhere they did not agree to go, and no
 * layout note is worth that.
 *
 * ── IT IS NOT A DECORATION EITHER ───────────────────────────────────────────
 * The founder's other standing instruction is "no fake UI or dead
 * interactions", and a box you can type into that throws the words away on
 * submit is exactly that. So it is a real GET form: what you write here IS the
 * picture description, and `/studio` opens with it already in the field
 * (`studio-workbench.tsx`'s `initialWanted`). Nothing is generated and nothing
 * is charged until the press on that screen, which states its own price.
 *
 * No client JavaScript. /home is the most visited route in the product and
 * carries a JS budget; a hero that shipped a state hook would spend from it to
 * deliver something worse than a form the browser already knows how to submit.
 */
export function StudioCard() {
  return (
    <section
      aria-labelledby="home-studio"
      data-guide="home.studio"
      className="surface-ring-firm rounded-card bg-brand-wash p-4 narrow:p-5"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          /* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 */
          className="grid size-8 flex-none place-items-center rounded-sm bg-tint-50 text-accent dark:bg-s2"
        >
          <Palette size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 id="home-studio" className="type-h3 text-ink">
            Studio
          </h2>
        </div>
      </div>

      <form action="/studio" className="mt-3 flex flex-wrap items-center gap-2.5">
        <div className="surface-ring flex min-w-0 flex-1 items-center rounded-pill bg-surface px-4 transition-micro focus-within:shadow-[inset_0_0_0_1.5px_var(--brand)]">
          <label htmlFor="home-describe" className="sr-only">
            Describe a picture for Sahoda to draw
          </label>
          <input
            id="home-describe"
            name="describe"
            type="text"
            maxLength={1000}
            /* The placeholder says what the next screen does. It is the one
               sentence on this card that has to be true, because it is what
               somebody reads before they decide to press. */
            placeholder="Describe a picture and Sahoda draws it, in your brand&rsquo;s colours"
            className="h-10 w-full min-w-0 bg-transparent type-sm text-ink outline-none placeholder:text-ink-mute"
          />
        </div>
        {/* A wash card with a dark button, never an orange one: docs/37 §16
            allows ONE solid brand fill per view and `Create post` beside this
            spends it. */}
        <button
          type="submit"
          className="inline-flex h-10 flex-none items-center gap-1.5 rounded-pill bg-ink px-4 type-sm font-[650] text-canvas transition-micro hover:bg-primary hover:text-primary-foreground max-narrow:w-full max-narrow:justify-center"
        >
          Open Studio
          <ArrowRight aria-hidden className="size-3.5" />
        </button>
      </form>
    </section>
  )
}
