import { inflateSync } from 'node:zlib'

/**
 * Text out of a PDF, with a gate in front of it.
 *
 * ── Read this before improving the parser ────────────────────────────────────
 *
 * The parser is the LESS important half of this file. A PDF text extractor
 * fails in three ordinary ways — a scanned document (no text at all, just an
 * image), a CID-keyed font (byte codes that are glyph indices, not characters),
 * and object streams (the text is one more compression layer down) — and in all
 * three the failure mode is not an exception and not an empty string. It is
 * PLAUSIBLE GARBAGE: a few hundred characters that look like they might be
 * words. Fed into `brand_guidelines`, that produces a Brand Brain the model is
 * completely confident about and that has nothing to do with the business. That
 * is the "no fake success states" rule broken at the only point in the product
 * where the user cannot check the work.
 *
 * So the contract here is: extract, then REFUSE anything that does not read
 * like prose, and hand back text the caller is expected to show the user before
 * using it. A refusal costs one sentence typed into the box below. A confident
 * wrong answer costs the whole Brand Brain.
 *
 * The real fix is a maintained library (`unpdf`, `pdf-parse`) — filed in
 * `apps/web/REQUESTS.md`, since UI_RULES_v3 requires asking before adding a
 * dependency. This handles the common case (Flate-compressed content streams
 * with simple fonts) with no dependency and refuses the rest.
 */

/** Bigger than a menu, a one-pager or a deck. Above this we do not even try. */
export const MAX_PDF_BYTES = 8 * 1024 * 1024
/** Enough to characterise a business; the model prompt is bounded anyway. */
export const MAX_TEXT_CHARS = 20_000
/** Below this many prose-like words there is nothing to resolve a brand from. */
export const MIN_WORDS = 40
/** Share of extracted characters that must be letters, digits or punctuation. */
export const MIN_LEGIBLE_RATIO = 0.75
/** Share of extracted words that must look like words rather than glyph soup. */
export const MIN_WORDLIKE_RATIO = 0.6

export type PdfTextResult =
  { ok: true; text: string; words: number } | { ok: false; reason: string }

/**
 * A byte-preserving view of the file. `latin1` is a 1:1 byte↔code-unit mapping,
 * so offsets found in this string are exact byte offsets — which `utf8` would
 * not give (multi-byte sequences collapse, and lone high bytes become U+FFFD).
 */
function asLatin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1')
}

/** How far back from `stream` to look for the dictionary that describes it. */
const DICT_LOOKBACK = 2048

/**
 * Inflate every FlateDecode content stream in the file.
 *
 * Streams whose dictionary names a filter we do not implement (LZW, JBIG2,
 * DCT — the last two being images) are skipped rather than guessed at, and a
 * stream that fails to inflate is skipped too: a corrupt object should cost its
 * own text, not the whole document's.
 */
function inflateStreams(latin: string): string[] {
  const out: string[] = []
  let cursor = 0

  for (;;) {
    const start = latin.indexOf('stream', cursor)
    if (start === -1) return out
    const end = latin.indexOf('endstream', start)
    if (end === -1) return out
    cursor = end + 'endstream'.length

    const dict = latin.slice(Math.max(0, start - DICT_LOOKBACK), start)
    if (!dict.includes('/FlateDecode')) continue

    // The stream keyword is followed by CRLF or LF — never CR alone (spec 7.3.8).
    let from = start + 'stream'.length
    if (latin[from] === '\r') from += 1
    if (latin[from] === '\n') from += 1

    try {
      out.push(inflateSync(Buffer.from(latin.slice(from, end), 'latin1')).toString('latin1'))
    } catch {
      continue
    }
  }
}

/** Resolve a PDF string escape (spec 7.3.4.2). Returns [text, nextIndex]. */
function readEscape(content: string, index: number): [string, number] {
  const char = content[index]
  if (char === undefined) return ['', index + 1]

  const simple: Record<string, string> = {
    n: '\n',
    r: '\n',
    t: '\t',
    b: '',
    f: '',
    '(': '(',
    ')': ')',
    '\\': '\\',
  }
  if (char in simple) return [simple[char]!, index + 1]

  // \ddd — one to three octal digits.
  if (char >= '0' && char <= '7') {
    let digits = ''
    let cursor = index
    while (digits.length < 3 && content[cursor] !== undefined && /[0-7]/.test(content[cursor]!)) {
      digits += content[cursor]
      cursor += 1
    }
    return [String.fromCharCode(parseInt(digits, 8)), cursor]
  }

  // A backslash before a newline is a line continuation — it yields nothing.
  if (char === '\n' || char === '\r') return ['', index + 1]
  return [char, index + 1]
}

/** Read a literal `(…)` string starting AT the opening paren. */
function readLiteralString(content: string, open: number): [string, number] {
  let text = ''
  let depth = 1
  let index = open + 1

  while (index < content.length) {
    const char = content[index]!
    if (char === '\\') {
      const [decoded, next] = readEscape(content, index + 1)
      text += decoded
      index = next
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return [text, index + 1]
    }
    text += char
    index += 1
  }
  return [text, index]
}

/** Read a hex `<…>` string starting AT the opening angle bracket. */
function readHexString(content: string, open: number): [string, number] {
  const close = content.indexOf('>', open)
  if (close === -1) return ['', content.length]

  const digits = content.slice(open + 1, close).replace(/[^0-9a-f]/gi, '')
  let text = ''
  for (let index = 0; index + 1 < digits.length; index += 2) {
    text += String.fromCharCode(parseInt(digits.slice(index, index + 2), 16))
  }
  // An odd trailing digit is padded with 0 (spec 7.3.4.3).
  if (digits.length % 2 === 1) {
    text += String.fromCharCode(parseInt(`${digits[digits.length - 1]}0`, 16))
  }
  return [text, close + 1]
}

/** A kern this wide is a word gap, not letter spacing (units are 1/1000 em). */
const WORD_GAP = 180

/**
 * Pull the text-showing operands out of one content stream.
 *
 * Only strings that are operands of Tj / TJ / ' / " are emitted. Collecting
 * every `(…)` in the stream would be simpler and would also sweep up font
 * names, marked-content tags and OCG labels as if they were body copy.
 */
function showText(content: string): string {
  let out = ''
  let pending = ''
  let index = 0

  while (index < content.length) {
    const char = content[index]!

    if (char === '(') {
      const [text, next] = readLiteralString(content, index)
      pending += text
      index = next
      continue
    }
    if (char === '<' && content[index + 1] !== '<') {
      const [text, next] = readHexString(content, index)
      pending += text
      index = next
      continue
    }
    // Inside a TJ array a large negative adjustment is the space between words.
    if (char === '-' || (char >= '0' && char <= '9')) {
      const match = /^-?\d+(\.\d+)?/.exec(content.slice(index, index + 24))
      if (match) {
        if (pending && Number(match[0]) <= -WORD_GAP) pending += ' '
        index += match[0].length
        continue
      }
    }
    if (char === 'T' || char === "'" || char === '"') {
      const op = content.slice(index, index + 2)
      if (op === 'Tj' || op === 'TJ') {
        out += `${pending} `
        pending = ''
        index += 2
        continue
      }
      // Both ' and " show text AND move to the next line.
      if (char === "'" || char === '"') {
        out += `${pending}\n`
        pending = ''
        index += 1
        continue
      }
      if (op === 'Td' || op === 'TD' || op === 'T*') {
        out += '\n'
        index += 2
        continue
      }
    }
    // Anything else ends the current operand run without showing it.
    if (char === ']' || char === '[') {
      index += 1
      continue
    }
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    pending = ''
    index += 1
  }
  return out
}

/** Collapse the whitespace an extractor inevitably over-produces. */
function tidy(raw: string): string {
  return raw
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS)
}

/** A token that reads like a word: mostly letters, a plausible length. */
function isWordlike(token: string): boolean {
  if (token.length < 2 || token.length > 24) return false
  const letters = token.replace(/[^\p{L}]/gu, '').length
  return letters >= 2 && letters / token.length >= 0.6
}

export interface TextQuality {
  /** Every whitespace-separated token, word or not. Distinguishes "no text at
   *  all" (a scan) from "plenty of text, none of it words" (a CID font). */
  tokens: number
  words: number
  wordlikeRatio: number
  legibleRatio: number
}

/**
 * Measure whether extracted text reads like prose. Exported because the same
 * judgement applies to page text, and because a gate you cannot inspect is a
 * gate nobody trusts.
 */
export function measureText(text: string): TextQuality {
  const tokens = text.split(/\s+/).filter(Boolean)
  const wordlike = tokens.filter(isWordlike).length
  const legible = text.replace(/[^\p{L}\p{N}\p{P}\p{Zs}\n]/gu, '').length

  return {
    tokens: tokens.length,
    words: wordlike,
    wordlikeRatio: tokens.length === 0 ? 0 : wordlike / tokens.length,
    legibleRatio: text.length === 0 ? 0 : legible / text.length,
  }
}

/**
 * The gate. Split from `pdfText` so page text can reuse it and so the thresholds
 * are testable without constructing a PDF.
 *
 * ORDER MATTERS, and the obvious order is wrong. Checking the word COUNT first
 * reads every failure as "we found nothing", because a CID-keyed font yields
 * hundreds of tokens of which zero are words — so a font problem got reported
 * as "a scanned or image-only file", sending the user off to re-scan a document
 * that was never scanned. Volume is judged before quality so each failure is
 * named as itself.
 */
export function gateText(text: string, source: 'PDF' | 'page'): PdfTextResult {
  const quality = measureText(text)

  // Plenty came out, and it is not language: the fonts are not carrying their
  // characters. Re-uploading will never fix this one.
  const hasVolume = quality.tokens >= MIN_WORDS
  const isLanguage =
    quality.wordlikeRatio >= MIN_WORDLIKE_RATIO && quality.legibleRatio >= MIN_LEGIBLE_RATIO
  if (hasVolume && !isLanguage) {
    return {
      ok: false,
      reason: `That ${source} came out as symbols rather than words — its fonts do not carry their text. Type a sentence instead.`,
    }
  }

  if (quality.words < MIN_WORDS) {
    return {
      ok: false,
      reason: `We could only read ${quality.words} words out of that ${source} — a scanned or image-only file reads as empty. Type a sentence instead.`,
    }
  }
  return { ok: true, text, words: quality.words }
}

/**
 * Extract readable text from a PDF, or say why not. Never throws.
 */
export function pdfText(bytes: Uint8Array): PdfTextResult {
  if (bytes.byteLength === 0) return { ok: false, reason: 'That file is empty.' }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return {
      ok: false,
      reason: `That PDF is over ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB — upload a shorter one, or type a sentence instead.`,
    }
  }

  let latin: string
  try {
    latin = asLatin1(bytes)
  } catch {
    return { ok: false, reason: 'That file could not be read — type a sentence instead.' }
  }

  if (!latin.startsWith('%PDF-')) {
    return { ok: false, reason: 'That file is not a PDF — upload a PDF, or type a sentence.' }
  }
  // An encrypted PDF inflates to ciphertext, which would sail past a naive
  // parser and fail the gate below with a misleading reason. Name it here.
  if (/\/Encrypt[\s/<]/.test(latin)) {
    return {
      ok: false,
      reason: 'That PDF is password-protected, so its text is unreadable. Type a sentence instead.',
    }
  }

  const streams = inflateStreams(latin)
  if (streams.length === 0) {
    return {
      ok: false,
      reason: 'We could not read any text out of that PDF — type a sentence instead.',
    }
  }

  return gateText(tidy(streams.map(showText).join('\n')), 'PDF')
}
