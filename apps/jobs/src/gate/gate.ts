import {
  decideGate,
  intakeFrom,
  ownerBannedPhrasesFrom,
  ownerRedLinesFrom,
  resolveRuleSet,
  runHardChecks,
  type GateCheckInput,
  type GateVerdict,
  type PublishGate,
  type RuleSet,
} from '@sahoda/shared'

import type { GateClassifier } from './classifier'
import type { GateAuditEntry, GateContext } from './store'

/**
 * The four layers, composed, with the audit write on the way out.
 *
 * ── THIS FUNCTION MUST NOT THROW, AND THAT IS THE WHOLE DESIGN ───────────────
 * `runPublishPost` calls it inline. If it threw, the call site would have to
 * decide what an exception means — and the tempting answer at a call site
 * halfway through a publish is always "carry on". So every failure here becomes
 * a `hold` verdict instead: an unreadable brain, a database that will not
 * answer, a model that will not respond, an audit write that is refused.
 *
 * The audit write in particular fails the post rather than being swallowed.
 * "Keep the record" is one of doc 18 §8's seven rules, and a publish nobody can
 * prove was checked is a publish that was not checked, as far as an auditor is
 * concerned.
 */

export interface CreatePublishGateOptions {
  loadGateContext(postId: string): Promise<GateContext | null>
  writeGateAudit(entry: GateAuditEntry): Promise<void>
  classifier: GateClassifier
}

/** A verdict that could not be reached, in the shape everything downstream expects. */
function unavailable(reason: string): GateVerdict {
  return {
    decision: 'hold',
    findings: [],
    // The floor rule set with nothing resolved: honest about the fact that
    // nothing was read, rather than reporting a rule set that was never applied.
    ruleSet: EMPTY_RULE_SET,
    brandVersion: null,
    checks: { hard: 'ran', classifier: 'unavailable' },
    holdReason: reason,
  }
}

const EMPTY_RULE_SET: RuleSet = {
  ruleSetVersion: 'unresolved',
  packs: [],
  rules: [],
  regime: { value: 'unknown', locale: 'unknown', basis: 'default' },
}

export function createPublishGate(opts: CreatePublishGateOptions): PublishGate {
  async function check(input: GateCheckInput): Promise<GateVerdict> {
    let verdict: GateVerdict
    let workspaceId = input.workspaceId

    try {
      const context = await opts.loadGateContext(input.postId)
      if (context === null) {
        // The post is gone, or was never there. Nothing to gate against, and a
        // publish of a post that does not exist is not something to wave
        // through — `runPublishPost` will fail it on its own terms, but the
        // gate must not be the layer that said yes.
        return unavailable('This post could not be read, so nothing was cleared to go out.')
      }
      // From `posts`, not from the payload — see the note on `loadGateContext`.
      workspaceId = context.workspaceId

      verdict = await runLayers(input, context)
    } catch {
      verdict = unavailable('The rule check could not run, so nothing was cleared to go out.')
    }

    // ── THE RECORD, AND IT IS NOT BEST-EFFORT ─────────────────────────────────
    // A pass whose audit row failed to write is a publish nobody can later prove
    // was checked. Doc 18 §8's property — "you can later prove what rule set was
    // in force" — does not survive a swallowed insert, so a failed write turns a
    // pass into a hold. A block or a hold is left alone: the post is not going
    // out either way, and downgrading an existing refusal buys nothing.
    try {
      await opts.writeGateAudit({
        workspaceId,
        actor: input.jobRunId,
        action: `publish_gate.${verdict.decision}`,
        target: { postId: input.postId, variantId: input.variantId, channel: input.channel },
        meta: auditMeta(verdict),
        traceId: input.jobRunId,
      })
    } catch {
      if (verdict.decision === 'pass') {
        return unavailable('The check could not be recorded, so this was not sent.')
      }
    }

    return verdict
  }

  async function runLayers(input: GateCheckInput, context: GateContext): Promise<GateVerdict> {
    // LAYER 1 — resolve the rule set, in code, from what is stored.
    const intake = intakeFrom(context.payload)
    const ruleSet = resolveRuleSet({
      ...intake,
      ownerRedLines: ownerRedLinesFrom(context.payload),
      ownerBannedPhrases: ownerBannedPhrasesFrom(context.payload),
    })

    // LAYER 2 — the hard checks.
    const hard = runHardChecks(input.text, ruleSet.rules)

    // Short-circuit before layer 3: a quoted phrase is a fact, no model gets to
    // overturn it, and there is no reason to pay for an opinion about it.
    if (hard.findings.length > 0) {
      return decideGate({
        text: input.text,
        ruleSet,
        hardFindings: hard.findings,
        unjudged: hard.unjudged,
        classifier: { ran: false, state: 'skipped-already-blocked' },
        brandVersion: context.brandVersion,
      })
    }

    // LAYER 3 — the bounded classifier, on exactly the rules layer 2 could not
    // judge. Every failure inside `classify` comes back as a state, never a throw.
    const classifier = await opts.classifier.classify(
      {
        channel: input.channel,
        text: input.text,
        rules: hard.unjudged.map((rule) => ({
          id: rule.id,
          tier: rule.tier,
          statement: rule.statement,
        })),
      },
      { workspaceId: context.workspaceId, traceId: input.jobRunId },
    )

    // LAYER 4's input. `decideGate` decides; the human review this produces is
    // the publish landing in a refused state with the reason attached, which is
    // what a person then acts on.
    return decideGate({
      text: input.text,
      ruleSet,
      hardFindings: [],
      unjudged: hard.unjudged,
      classifier,
      brandVersion: context.brandVersion,
    })
  }

  return { check }
}

/**
 * What goes in `audit_logs.meta` — doc 18 §8's list, minus what we cannot know.
 *
 * The findings carry `statement` and `quote`, which are OUR rule text and a
 * verified span of the customer's own post. Neither is model prose: `decideGate`
 * drops a quote that is not literally in the post, and the model's `why` is
 * never carried at all. An audit row is read later by people who will treat what
 * is in it as fact.
 */
function auditMeta(verdict: GateVerdict): Record<string, unknown> {
  return {
    ruleSetVersion: verdict.ruleSet.ruleSetVersion,
    packs: verdict.ruleSet.packs,
    regime: verdict.ruleSet.regime,
    brandVersion: verdict.brandVersion,
    checks: verdict.checks,
    classifierModel: verdict.classifierModel ?? null,
    rulesChecked: verdict.ruleSet.rules.length,
    findings: verdict.findings.map((f) => ({
      ruleId: f.ruleId,
      tier: f.tier,
      source: f.source,
      layer: f.layer,
      statement: f.statement,
      quote: f.quote ?? null,
    })),
    holdReason: verdict.holdReason ?? null,
    // Doc 18 §8 asks for "who approved". Nothing records one: `approvePost`
    // writes `{ status: 'approved' }` and no approver, and `posts` has no column
    // for it. Null here is the honest answer, and it is written explicitly so
    // that a later reader sees a gap rather than assuming `actor` was a person
    // who reviewed this. See apps/web/REQUESTS.md.
    approver: null,
  }
}
