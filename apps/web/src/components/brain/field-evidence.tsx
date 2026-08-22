import Link from 'next/link'
import { FileText } from 'lucide-react'

import type { CitedPassage } from '@/lib/knowledge/store'

/**
 * WHERE THIS GUESS CAME FROM — the passage, quoted, under the field.
 *
 * ── THIS IS THE HALF OF THE CONSOLE THAT DID NOT EXIST ──────────────────────
 * `lib/brand/brain-origin.ts` argued that per-field evidence "cannot be built
 * honestly", and it was right about the path it described: `brand_guidelines`
 * reads the whole door text and writes fifteen fields in one object, so nothing
 * links a field to a passage, and stamping a URL into each field's source would
 * record a fact about the BRAIN in a slot the reader takes as a fact about the
 * FIELD.
 *
 * A library-backed proposal is a different path with a different property.
 * `brand_extract` cites a BLOCK INDEX, `attachProvenance` resolves that index
 * against a list we built, and an index we did not supply drops the field
 * outright. So the link is not inferred — it is the model choosing from a list,
 * resolved by code the model cannot reach.
 *
 * Both remain true at once, which is why `NO_PER_FIELD_EVIDENCE` still appears
 * on the same screen: fields written by the guidelines pass have no evidence and
 * say so, and fields traced to a passage show it. Two states, both named.
 *
 * ── THE RING IS UNTOUCHED BY THIS ───────────────────────────────────────────
 * A citation is not a confirmation. A field with a perfect quotation under it is
 * still a guess until a person agrees, still renders dashed, and still counts
 * against the ring exactly as it did. This component adds evidence to a guess;
 * it does not promote it.
 */
export function FieldEvidence({ cited }: { cited: CitedPassage }) {
  return (
    <div className="mt-2 rounded-input bg-s1 px-2.5 py-2">
      <p className="type-sm flex flex-wrap items-center gap-1.5 text-muted">
        <FileText size={13} strokeWidth={1.8} aria-hidden className="shrink-0" />
        <span>Sahoda read this in</span>
        {cited.missing ? (
          // The document is gone and the field is not. Deleting a document
          // deliberately does not retract what the brain learned from it, so
          // this says what happened rather than hiding the field or pretending
          // the source is still openable.
          <span className="font-[550] text-ink">{cited.documentTitle}</span>
        ) : (
          <Link
            href="/brain/knowledge"
            className="font-[550] text-accent underline underline-offset-2"
          >
            {cited.documentTitle}
          </Link>
        )}
        {cited.ordinal !== null ? (
          <span>
            · passage <span className="num">{cited.ordinal + 1}</span>
          </span>
        ) : null}
      </p>

      {cited.text ? (
        // The document's own words, quoted rather than paraphrased. A summary
        // here would be a second inference stacked on the first, and the entire
        // point of showing it is that the reader can check the first one.
        <blockquote className="type-sm mt-1.5 border-l-2 border-line pl-2.5 text-muted">
          {cited.text.length > 400 ? `${cited.text.slice(0, 400)}…` : cited.text}
        </blockquote>
      ) : cited.missing ? (
        <p className="type-sm mt-1 text-muted">
          That document is no longer in your library. Sahoda kept what it learned from it — this
          value is unchanged — but the passage behind it can no longer be opened.
        </p>
      ) : null}
    </div>
  )
}
