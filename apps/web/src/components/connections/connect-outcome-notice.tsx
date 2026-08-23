import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'

/**
 * What just happened on the trip back from Zernio, said out loud.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `/api/oauth/zernio/return` has always redirected here with `?zernio=…&reason=…`,
 * and this page has never read either one. So every outcome — connected, nothing
 * to do, outright failure — landed on an identical screen, and the only difference
 * between "your account is connected" and "your account was dropped" was a query
 * string nothing displayed. The route's careful 4xx/5xx work made failures visible
 * to a LOG READER; this makes them visible to the person they happened to.
 *
 * ── THE COPY COMES FROM THE STATUS, AND THE STATUS IS AN ALLOWLIST ────────────
 * Everything in this URL arrived through the user's browser, which is the same
 * reason the return route refuses to read `accountId` off it. So `reason` is never
 * rendered — it exists for logs — and `zernio` is matched against a fixed set. An
 * unrecognised value renders nothing at all rather than being echoed.
 *
 * No counts either, for the same reason: "2 accounts didn't connect" would be a
 * number taken from the address bar. The list below this notice is the truth about
 * what exists, and it is read from the database.
 */

export type ConnectOutcome = 'connected' | 'partial' | 'error' | 'limit' | 'nothing'

interface OutcomeCopy {
  readonly title: string
  readonly body: string
  readonly icon: typeof Info
  /** Token pair for the block. Never a raw hex — see apps/web/CLAUDE.md. */
  readonly tone: string
}

const OUTCOMES: Readonly<Record<ConnectOutcome, OutcomeCopy>> = {
  connected: {
    title: 'Connected',
    body: 'The account is in the list below and can be posted to.',
    icon: CheckCircle2,
    tone: 'border-ok bg-ok-bg text-ok',
  },
  partial: {
    // Deliberately not "connected with a warning". Some accounts are missing, and
    // the customer has to act on that — so it leads with what did NOT happen.
    title: 'Some accounts didn’t finish connecting',
    body: 'What’s listed below is everything we have. Connect the rest again. The ones that already worked will not be affected.',
    icon: TriangleAlert,
    tone: 'border-warn bg-warn-bg text-warn',
  },
  error: {
    title: 'That connection didn’t finish',
    body: 'Nothing was changed. Try connecting the channel again.',
    icon: AlertCircle,
    tone: 'border-danger bg-danger-bg text-danger',
  },
  limit: {
    // Not `partial`, and not `error`. Nothing failed — we declined to add these,
    // which is a different thing and has a different fix. Saying "didn't finish
    // connecting" would send them to reconnect an account that will be declined
    // again for the same reason.
    title: 'Your plan is full',
    body: 'Everything we could add is listed below. The rest are still connected on the platform. Connect again once your plan has room and they’ll be picked up.',
    icon: Info,
    tone: 'border-line bg-s1 text-muted',
  },
  nothing: {
    title: 'Nothing new to connect',
    body: 'No new account came back from the platform. You may have closed its screen before approving.',
    icon: Info,
    tone: 'border-line bg-s1 text-muted',
  },
}

function isOutcome(value: string | undefined): value is ConnectOutcome {
  return value !== undefined && Object.hasOwn(OUTCOMES, value)
}

/** Renders nothing when the page was reached normally, or with a value we do not know. */
export function ConnectOutcomeNotice({ status }: { status?: string | string[] }) {
  // An array means the parameter was repeated. That is not a shape our own redirect
  // produces, so it is not one to interpret.
  if (typeof status !== 'string' || !isOutcome(status)) return null

  const copy = OUTCOMES[status]
  const Icon = copy.icon

  return (
    <div
      role="status"
      data-outcome={status}
      className={`flex items-start gap-2 rounded-card border p-3 ${copy.tone}`}
    >
      <Icon size={15} strokeWidth={2} aria-hidden className="mt-[2px] shrink-0" />
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold">{copy.title}</p>
        <p className="text-[13px]">{copy.body}</p>
      </div>
    </div>
  )
}
