'use client'

import { REPORT } from '@/lib/report/strings'

/**
 * SEND TO WHATSAPP — and it never sends anything on the reader's behalf.
 *
 * It opens WhatsApp with the report already written in the box. The person
 * chooses who receives it and presses send themselves. Posting to somebody's
 * account without them watching is a line this product does not cross, and a
 * "send" that quietly delivered would be exactly that.
 */
export function WhatsappButton({ text }: { text: string }) {
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noreferrer"
      className="surface-ring-firm inline-flex h-control shrink-0 items-center rounded-sm bg-surface type-sm px-3 font-[550] text-ink transition-micro hover:bg-s2"
    >
      {REPORT.sendToWhatsapp}
    </a>
  )
}
