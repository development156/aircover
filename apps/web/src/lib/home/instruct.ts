/**
 * WHAT A TYPED SENTENCE ON THE CONSOLE TURNS INTO.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * The console may only promise what the product can already do from a click:
 * start a draft (the composer's own `createPost`) or open the screen that owns
 * the thing asked for. It never spends credits — "plan my week" costs twenty
 * and has its own cost preview on /planner, so the console takes you there
 * rather than pressing the button for you. And it never guesses: a sentence it
 * does not understand gets "cannot do that from here yet" and the three things
 * it can do, which is the honest empty state for a box that listens.
 *
 * Deterministic on purpose. No model call, no cost, no "Sahoda is thinking".
 * The vocabulary is small and written down here, so what the box understands
 * is a fact a test can pin.
 */
export type Instruction =
  | { kind: 'write'; title: string }
  | { kind: 'open'; href: OpenHref; label: string }
  | { kind: 'unknown' }

export type OpenHref =
  | '/planner'
  | '/connections'
  | '/approvals'
  | '/wallet'
  | '/onboarding'
  | '/brain'
  | '/posts'
  | '/analytics'

export const CAN_DO = ['write a post about …', 'open my week', 'connect an account'] as const

const OPENERS: readonly { test: RegExp; href: OpenHref; label: string }[] = [
  {
    test: /\b(plan|planner|schedule|calendar|my week|this week)\b/i,
    href: '/planner',
    label: 'your week',
  },
  {
    test: /\b(connect|instagram|linkedin|facebook|google|gbp|accounts?|channels?)\b/i,
    href: '/connections',
    label: 'your accounts',
  },
  {
    test: /\b(approve|approvals?|ok|okay|check|review|waiting)\b/i,
    href: '/approvals',
    label: 'what needs your OK',
  },
  {
    test: /\b(credits?|wallet|top ?up|buy|pay|plans?|pricing)\b/i,
    href: '/wallet',
    label: 'your credits',
  },
  {
    test: /\b(teach|brand|business|brain|voice|tone)\b/i,
    href: '/brain',
    label: 'your Brand Brain',
  },
  {
    test: /\b(numbers?|stats?|analytics|reach|views|followers|performance|doing)\b/i,
    href: '/analytics',
    label: 'how your posts are doing',
  },
  { test: /\b(posts?|drafts?)\b/i, href: '/posts', label: 'your posts' },
]

/**
 * "write …" and "draft …" always start a draft. "make", "create" and "start"
 * only do when a post, draft or caption is named, so "make me famous" is
 * refused rather than turned into a draft called "me famous".
 */
const WRITE_VERB =
  /^(?:please\s+)?(?:(?:write|draft)\b|(?:make|create|start)\s+(?:me\s+)?(?:a\s+|an\s+|new\s+)?(?:post|draft|caption)\b)/i
const WRITE_TITLE =
  /^(?:please\s+)?(?:write|draft|make|create|start)\s+(?:me\s+)?(?:a\s+|an\s+|new\s+)?(?:post|draft|caption)?\s*(?:about|on|for|saying|that says|:)?\s*(.*)$/i

export function parseInstruction(raw: string): Instruction {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (text === '') return { kind: 'unknown' }

  if (WRITE_VERB.test(text)) {
    const title =
      text
        .match(WRITE_TITLE)?.[1]
        ?.trim()
        .replace(/[.!]+$/, '') ?? ''
    // "write a post" with nothing after it still starts a draft; the composer
    // asks for the name. A title is capped where the composer caps it.
    return { kind: 'write', title: title.slice(0, 120) }
  }

  for (const opener of OPENERS) {
    if (opener.test.test(text)) return { kind: 'open', href: opener.href, label: opener.label }
  }
  return { kind: 'unknown' }
}

/** The sentence the console prints before it acts, so nothing happens unsaid. */
export function describeInstruction(instruction: Instruction): string {
  switch (instruction.kind) {
    case 'write':
      return instruction.title
        ? `Starting a draft called “${instruction.title}” and opening it for you.`
        : 'Starting a new draft and opening it for you.'
    case 'open':
      return `Opening ${instruction.label}.`
    case 'unknown':
      return `Sahoda cannot do that from here yet. Try: ${CAN_DO.join(', ')}.`
  }
}
