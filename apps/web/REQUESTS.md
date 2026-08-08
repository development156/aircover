# apps/web — cross-lane requests

Requests from this lane to the owners of shared code. Mirrors `packages/billing/REQUESTS.md`.

---

## wt-web: `<Button asChild>` throws on any child with more than one node — NOT fixed here

`src/components/ui/button.tsx` renders `{loading ? <Loader2/> : null}{children}` inside `Comp`.
With `asChild`, `Comp` is Radix `Slot`, which requires exactly one element child — so it receives
two nodes and throws _"Slot failed to slot onto its children"_ at render, not at typecheck. Note
this happens whether or not `loading` is set: `null` is still a second child node.

The inbox lane was the first caller to try it
(`<Button asChild><Link><Icon/>Open connections</Link></Button>`), so the path has never run in
this codebase. A production build would have shipped it.

Two defects in one, both on the `asChild` path only — the plain `<button>` path is fine:

1. **Slot arity.** Fix by wrapping: `<Comp>{asChild ? <Slottable>{children}</Slottable> : <>…</>}</Comp>`,
   or by refusing `loading` when `asChild` is set. The second is arguably more honest — a link has
   no pending state to show.
2. **`disabled` on an anchor.** `disabled={disabled || loading}` is forwarded to whatever element
   the child renders. On an `<a>` that attribute is not valid and does not disable anything, so a
   "disabled" link stays clickable.

**Worked around, not fixed:** `buttonVariants` is now exported (one-line, standard shadcn shape) and
`components/inbox/surface-notice.tsx` applies it to a plain `<Link>`. A shared control's `asChild`
path deserves its own review and test rather than a drive-by from a feature lane.

---

## wt-pub: `ZernioPlatformFilter` cannot express the conversations surface

`packages/publishing/src/zernio/reads.ts:190` types the `platform` filter on `listConversations`
as `facebook | instagram | twitter | bluesky | reddit | telegram`. It has **no `whatsapp` member**,
and no `googlebusiness` either.

WhatsApp is one of the three platforms with a modelled reply window
(`@sahoda/shared` `SEND_WINDOWS`), so a per-platform tab built on this filter would silently drop
WhatsApp conversations from a list the user reads as complete.

**Meanwhile:** the inbox reads every conversation unfiltered and labels each row's platform. No tab
filter ships. The lane did **not** cast past the type — a cast here would produce exactly the silent
omission the filter's narrowness is warning about.

**Ask:** confirm whether the omission reflects Zernio's actual accepted values (in which case the
conversations list can never be filtered to WhatsApp server-side and paging must account for it), or
whether the union is simply incomplete.

---

## wt-pub: `ZernioMessage.direction` is `[DOC]`-tier and load-bearing

`apps/web/src/lib/inbox/messages.ts` measures every send window from the newest message whose
`direction === 'inbound'`. `ZernioMessage.direction` is typed as a bare `string` and no live
`/inbox/conversations/{id}/messages` payload has been observed — doc 13 §12 records no messaging
behaviour at all, so `'inbound'` is the documented value, not a measured one.

If Zernio actually sends `'in'` or `'received'`, `newestInboundAt` returns null for every thread and
every reply affordance renders `unknown` forever.

**Meanwhile:** the degradation is the honest one — `unknown` claims nothing, and never renders a
thread as replyable that is not. But it is a degradation, and it will look like a working feature.

**Ask:** one real message payload, so this can be re-tiered to `[LIVE]` or corrected.
