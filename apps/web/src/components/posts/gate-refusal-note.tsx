import { ShieldAlert, ShieldQuestion } from 'lucide-react'

import { describeRuleSource, type GateRefusal } from '@/lib/posts/gate-refusal'

/**
 * Why a post did not go out, and what to do about it.
 *
 * ── THE RULE THIS COMPONENT EXISTS TO KEEP ───────────────────────────────────
 * Doc 18 §8: refuse with a reason and a way forward — name the line, say whether
 * it is inherited or theirs, offer a compliant rewrite in the same breath. "A
 * block that only says no teaches people to route around the product."
 *
 * So three things are always on screen together: the rule as written, where it
 * came from, and the wording that would pass. The customer's own words are
 * quoted back only where `decideGate` verified the quote is literally in their
 * post — a paraphrase has already been dropped upstream, because telling someone
 * they wrote words they did not write is the first thing anyone disputes.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
 * No "publish anyway". A mandated rule is not the owner's to waive, and offering
 * an override on their own rule turns their red line into a speed bump. The way
 * forward is the rewrite.
 */

export interface GateRefusalNoteProps {
  refusal: GateRefusal
}

export function GateRefusalNote({ refusal }: GateRefusalNoteProps) {
  const held = refusal.decision === 'hold'
  const Icon = held ? ShieldQuestion : ShieldAlert

  return (
    <div
      className="mt-1.5 rounded-input bg-s2 px-3 py-2"
      data-gate-decision={refusal.decision}
      role="note"
    >
      <p className="flex items-start gap-2 text-[12.5px] font-semibold">
        <Icon
          size={14}
          aria-hidden
          className={held ? 'mt-[3px] text-warn' : 'mt-[3px] text-danger'}
        />
        <span>
          {held
            ? 'Waiting for a person to read this'
            : refusal.findings.length > 1
              ? 'This breaks rules your brand is held to'
              : 'This breaks a rule your brand is held to'}
        </span>
      </p>

      {/* A hold has no finding to show when nobody could decide — the reason is
          the whole content, and saying nothing would read as an unexplained
          refusal. */}
      {held && refusal.findings.length === 0 && refusal.holdReason ? (
        <p className="mt-1 text-[12.5px] text-muted">{refusal.holdReason}</p>
      ) : null}

      <ul className="mt-1.5 space-y-2">
        {refusal.findings.map((finding) => {
          const source = describeRuleSource(finding, refusal.regimeBasis)
          return (
            <li key={finding.ruleId} data-rule-id={finding.ruleId} data-rule-tier={finding.tier}>
              <p className="text-[12.5px]">
                <span
                  className={
                    finding.tier === 'mandated'
                      ? 'mr-2 rounded-pill border border-line px-1.5 py-0.5 text-[11px] font-semibold text-danger'
                      : 'mr-2 rounded-pill border border-line px-1.5 py-0.5 text-[11px] font-semibold text-warn'
                  }
                >
                  {source.label}
                </span>
                {finding.statement}
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted">{source.detail}</p>

              {finding.quote ? (
                <p className="mt-1 text-[12px] text-muted">
                  In your post: <q className="text-foreground">{finding.quote}</q>
                </p>
              ) : null}

              {finding.rewrite ? (
                <p className="mt-1 text-[12px]">
                  {/* "Try" and not "Use": for an owner red line this sentence is
                      a model's suggestion about their own rule, and presenting a
                      suggestion as the fix would be the product deciding how
                      someone's brand should sound. */}
                  <span className="font-semibold">Try instead: </span>
                  <span className="text-muted">{finding.rewrite}</span>
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
