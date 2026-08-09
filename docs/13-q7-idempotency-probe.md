# Doc 13 §11 Q7 — measure Zernio's idempotency window

**Status: NOT RUN.** Designed here, blocked on execution — see "Why I could not run it".

This is the measurement SL-069 turns on. Doc 13 §5 records the window as "~5 minutes" and
marks it `[DOC]` — read in Zernio's documentation, never observed. `PUBLISH_LEASE_SECONDS`
is 600, so if the documented figure is right the lease re-claim lands *outside* the window
and the deterministic `requestId` does not prevent a duplicate. If the real window is
≥600s, SL-069 closes with no code change at all.

## What decides it

`x-request-id` is the idempotency key (`client.ts:431-442`). A collapsed request comes back
as `existingPost` rather than `post`, with HTTP 200 (`client.ts:187`, `zernio.ts:228-230`).
So the observable is simply **which key the response body uses**:

| response body | meaning |
|---|---|
| `{"existingPost": {...}}` | collapsed — inside the window |
| `{"post": {...}}` | NOT collapsed — window has expired, a new object was created |

## Design — deliberately non-publishing

Send the **same `x-request-id`** with a **different `content`** at increasing intervals.
Every request uses `publishNow: false` and a far-future `scheduledFor`, so a non-collapsed
attempt creates a *scheduled* Zernio post and **nothing goes live on Instagram**.

Different content each time matters: it is how you tell a collapse from a coincidence. A
collapsed response returns the FIRST body's content, not the one you just sent.

```bash
KEY=$(grep -m1 '^ZERNIO_API_KEY=' .env | cut -d= -f2- | tr -d '"'"'\''')
RID="sahoda-idem-probe-$(date +%s)"
ACCOUNT=6a75caf7d0fe733d1afcc1f4        # instagram, workspace 5f17dad6 (DIVAS's)
echo "requestId: $RID"

probe () {   # $1 = label
  curl -s -X POST "https://zernio.com/api/v1/posts" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -H "x-request-id: $RID" \
    -d "{\"content\":\"idem probe $1\",\"platforms\":[{\"platform\":\"instagram\",\"accountId\":\"$ACCOUNT\"}],\"publishNow\":false,\"scheduledFor\":\"2027-06-01T10:00:00.000Z\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); k='existingPost' if 'existingPost' in d else ('post' if 'post' in d else '?'); p=d.get(k) or {}; print(f\"$1  {k}  _id={p.get('_id')}  content={str(p.get('content'))[:24]!r}\")"
}

probe A;                    # t=0     baseline, creates the object
sleep 60   && probe B60     # t=1m    expect existingPost
sleep 120  && probe C180    # t=3m    expect existingPost
sleep 120  && probe D300    # t=5m    the documented edge
sleep 120  && probe E420    # t=7m
sleep 180  && probe F600    # t=10m   the lease length — the number that matters
```

Total ≈ 10 minutes.

## How to read it

- **First label whose `_id` differs from A's** = the window has expired between that
  interval and the previous one. Report the bracket, e.g. "collapsed at 300s, not at 420s
  → window is between 5 and 7 minutes".
- **If F600 still collapses**, the window is ≥600s ≥ `PUBLISH_LEASE_SECONDS`. **SL-069 is
  closed by the existing `requestId`** and the scheduled rail is safe to enable on that
  count. This is the outcome worth hoping for and it costs nothing to find out.
- **If it stops collapsing before 600s** (the documented ~5 min suggests it will), the gap
  is real and one of SL-069's three candidate fixes is required before
  `SAHODA_PUBLISH_ENABLED=true` on a rail that matters.

## Caveats, stated up front

1. **Scheduled vs immediate is an assumption.** The probe uses `publishNow: false` to keep
   anything from going live. If Zernio scopes idempotency differently for scheduled
   creates than for immediate ones, this measures the wrong window. Nothing in doc 13 says
   either way. A follow-up with `publishNow: true` would be authoritative — and would post
   publicly each time it does *not* collapse, which is why it is not the default here.
2. **Residue.** Every non-collapsed attempt leaves a scheduled Zernio post dated 2027.
   `ZernioClient` exposes no delete, so they cannot be cleaned up through our code — remove
   them in Zernio's UI, or leave them; a 2027 schedule will not fire in any relevant window.
3. **One account, one moment.** A single run measures Zernio's behaviour today for this
   profile. Treat the result as an observation, not a contract — record it in doc 13 §5 as
   `[LIVE <date>]` alongside the existing `[DOC]`, rather than replacing it.

## Why I could not run it

The permission layer denied the outbound request twice this session — once for a
**read-only** GET `/analytics` and once for this POST. The boundary is "do not send
`ZERNIO_API_KEY` to an external host from this shell", and it is the correct boundary; I
did not route around it. Run the block above with a leading `!` and paste the six lines.
