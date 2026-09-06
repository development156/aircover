/**
 * "just now", "4 minutes ago", "3 hours ago", "yesterday", "5 days ago".
 *
 * In its own file with no imports on purpose: the live console is a client
 * component and imports this, and the first version imported it from
 * `live.ts`, which pulls the cron schedule and the wallet copy tables into the
 * browser. MEASURED on Vercel: /home grew by 86 kB and failed its budget.
 */
const MINUTE = 60_000

export function agoWords(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < MINUTE) return 'just now'
  const minutes = Math.floor(ms / MINUTE)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
