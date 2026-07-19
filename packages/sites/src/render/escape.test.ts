import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { escapeHtml, escapeAttr, safeUrl, stripControl } from './escape'

interface StringCase {
  name: string
  input: string
  expected: string
}

interface NamedInput {
  name: string
  input: string
}

interface UnknownCase {
  name: string
  input: unknown
  expected: string
}

interface UrlCase {
  name: string
  input: unknown
  expected: string | null
}

// -- escapeHtml: text context -------------------------------------------------

const TEXT_CASES: ReadonlyArray<StringCase> = [
  { name: 'a less-than, which would otherwise open a tag', input: '<', expected: '&lt;' },
  { name: 'a greater-than, which would otherwise close a tag', input: '>', expected: '&gt;' },
  { name: 'an ampersand, so existing entities cannot be forged', input: '&', expected: '&amp;' },
  { name: 'a double quote', input: '"', expected: '&quot;' },
  { name: 'a single quote', input: "'", expected: '&#39;' },
  {
    name: 'a full script payload, the worst case for a live tenant domain',
    input: '<script>alert(1)</script>',
    expected: '&lt;script&gt;alert(1)&lt;/script&gt;',
  },
  {
    name: 'ordinary marketing copy containing an ampersand',
    input: 'Tom & Jerry',
    expected: 'Tom &amp; Jerry',
  },
]

describe('escapeHtml - text context', () => {
  for (const testCase of TEXT_CASES) {
    it(`escapes ${testCase.name}`, () => {
      expect(escapeHtml(testCase.input)).toBe(testCase.expected)
    })
  }

  it('preserves newlines and tabs so multi-line model copy is not mangled', () => {
    expect(escapeHtml('line one\nline two\tindented')).toBe('line one\nline two\tindented')
  })

  it('strips a bidi override embedded in copy, which can visually reverse a link label', () => {
    expect(escapeHtml('invoice\u202Efdp.exe')).toBe('invoicefdp.exe')
  })
})

describe('escapeHtml - injection payloads cannot re-enter markup', () => {
  it('leaves no raw angle bracket when a script payload is placed inside a paragraph', () => {
    const rendered = `<p>${escapeHtml('</p><script>fetch("//evil")</script><p>')}</p>`

    expect(rendered).toBe(
      '<p>&lt;/p&gt;&lt;script&gt;fetch(&quot;//evil&quot;)&lt;/script&gt;&lt;p&gt;</p>',
    )
    expect(rendered.match(/<script/g)).toBeNull()
  })

  it('neutralizes an img onerror payload placed in a text node', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('escapeHtml - escaping order and re-escape stability', () => {
  it('escapes the ampersand first, so an entity-looking input is not passed through', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('produces the exact twice-escaped form on a second pass, never un-escaping', () => {
    expect(escapeHtml(escapeHtml('<b>&"'))).toBe('&amp;lt;b&amp;gt;&amp;amp;&amp;quot;')
  })

  it('yields no dangerous raw character after a second pass over a script payload', () => {
    const twice = escapeHtml(escapeHtml('<script>alert("x")</script>'))

    expect(twice.includes('<')).toBe(false)
    expect(twice.includes('>')).toBe(false)
    expect(twice.includes('"')).toBe(false)
  })
})

// -- escapeAttr: attribute context --------------------------------------------

const ATTR_CASES: ReadonlyArray<StringCase> = [
  {
    name: 'a double quote, which would close the attribute',
    input: '"',
    expected: '&quot;',
  },
  { name: 'a single quote', input: "'", expected: '&#39;' },
  { name: 'an ampersand', input: '&', expected: '&amp;' },
  { name: 'a less-than', input: '<', expected: '&lt;' },
  {
    name: 'a backtick, which legacy parsers treat as an attribute delimiter',
    input: '`',
    expected: '&#96;',
  },
  {
    name: 'a newline, which can split an attribute into a new one',
    input: 'a\nb',
    expected: 'a&#10;b',
  },
  {
    name: 'a tab, which is attribute-name whitespace to a parser',
    input: 'a\tb',
    expected: 'a&#9;b',
  },
  {
    name: 'a carriage return, which a parser also reads as attribute whitespace',
    input: 'a\rb',
    expected: 'a&#13;b',
  },
  {
    name: 'a CRLF pair, the line ending model copy most often arrives with',
    input: 'a\r\nb',
    expected: 'a&#13;&#10;b',
  },
]

describe('escapeAttr - attribute context', () => {
  for (const testCase of ATTR_CASES) {
    it(`escapes ${testCase.name}`, () => {
      expect(escapeAttr(testCase.input)).toBe(testCase.expected)
    })
  }

  it('prevents an injected event-handler attribute from breaking out of alt=""', () => {
    const rendered = `<img alt="${escapeAttr('" onerror="alert(1)')}">`

    expect(rendered).toBe('<img alt="&quot; onerror=&quot;alert(1)">')
    expect(rendered.includes('onerror="')).toBe(false)
  })

  it('leaves no raw carriage return that could start a new attribute', () => {
    const rendered = `<img alt="${escapeAttr('x\ronerror=alert(1)')}">`

    expect(rendered.includes('\r')).toBe(false)
    expect(rendered).toBe('<img alt="x&#13;onerror=alert(1)">')
  })
})

/**
 * The exact contract, pinned so the 17 downstream tasks cannot assume more than it gives:
 * escapeAttr does NOT escape space or `=`, and is safe only inside a quoted value.
 */
describe('escapeAttr - the output is safe only inside a quoted attribute value', () => {
  it('is safe inside double quotes, the only attribute form this package emits', () => {
    const rendered = `<div class="${escapeAttr('x" onmouseover="alert(1)')}"></div>`

    expect(rendered).toBe('<div class="x&quot; onmouseover=&quot;alert(1)"></div>')
    expect(rendered.includes('onmouseover="')).toBe(false)
  })

  it('is safe inside single quotes too, because the apostrophe is escaped', () => {
    const rendered = `<div class='${escapeAttr("x' onmouseover='alert(1)")}'></div>`

    expect(rendered).toBe(`<div class='x&#39; onmouseover=&#39;alert(1)'></div>`)
  })

  it('does not escape space, so class="hero cta" keeps working', () => {
    expect(escapeAttr('hero cta')).toBe('hero cta')
  })

  it('does not escape the equals sign, so data-x="a=b" keeps working', () => {
    expect(escapeAttr('a=b')).toBe('a=b')
  })

  it('does NOT cover an unquoted attribute, which is why callers must always quote', () => {
    const unquoted = `<div class=${escapeAttr('x onmouseover=alert(1)')}></div>`

    // A documented limit, not a passing behaviour: the value escaped fine, but with no quotes
    // the space still starts a second attribute. Emit name="${escapeAttr(value)}" instead.
    expect(unquoted).toBe('<div class=x onmouseover=alert(1)></div>')
  })
})

// -- non-string inputs ---------------------------------------------------------

const COERCE_CASES: ReadonlyArray<UnknownCase> = [
  { name: 'null', input: null, expected: '' },
  { name: 'undefined', input: undefined, expected: '' },
  { name: 'a whole number', input: 42, expected: '42' },
  { name: 'zero, which must not be treated as absent', input: 0, expected: '0' },
  { name: 'a negative decimal', input: -1.5, expected: '-1.5' },
  { name: 'NaN, which must not print as "NaN" on a live page', input: NaN, expected: '' },
  { name: 'Infinity', input: Infinity, expected: '' },
  { name: 'true', input: true, expected: 'true' },
  { name: 'false', input: false, expected: 'false' },
  { name: 'a plain object, which must not print "[object Object]"', input: {}, expected: '' },
  { name: 'an empty array', input: [], expected: '' },
  {
    name: 'an array holding a payload, so join() cannot smuggle markup through',
    input: ['<script>'],
    expected: '',
  },
  { name: 'a bigint', input: 10n, expected: '10' },
  { name: 'a function', input: () => 'x', expected: '' },
  { name: 'a symbol, which String() alone would throw on', input: Symbol('x'), expected: '' },
]

describe('escapeHtml - non-string input is coerced, never thrown on', () => {
  for (const testCase of COERCE_CASES) {
    it(`renders ${testCase.name} as ${JSON.stringify(testCase.expected)}`, () => {
      expect(escapeHtml(testCase.input)).toBe(testCase.expected)
    })
  }
})

describe('escapeAttr - non-string input is coerced, never thrown on', () => {
  for (const testCase of COERCE_CASES) {
    it(`renders ${testCase.name} as ${JSON.stringify(testCase.expected)}`, () => {
      expect(escapeAttr(testCase.input)).toBe(testCase.expected)
    })
  }
})

describe('stripControl - non-string input is coerced, never thrown on', () => {
  for (const testCase of COERCE_CASES) {
    it(`renders ${testCase.name} as ${JSON.stringify(testCase.expected)}`, () => {
      expect(stripControl(testCase.input)).toBe(testCase.expected)
    })
  }

  it('does not throw on null, which it is public and so will eventually be handed', () => {
    expect(() => stripControl(null)).not.toThrow()
  })
})

// -- safeUrl --------------------------------------------------------------------

const URL_ACCEPTED: ReadonlyArray<UrlCase> = [
  { name: 'an https url', input: 'https://example.com', expected: 'https://example.com' },
  {
    name: 'an http url with a query string',
    input: 'http://example.com/x?y=1&z=2',
    expected: 'http://example.com/x?y=1&z=2',
  },
  { name: 'a mailto link', input: 'mailto:hi@sahoda.com', expected: 'mailto:hi@sahoda.com' },
  { name: 'a tel link', input: 'tel:+919876543210', expected: 'tel:+919876543210' },
  { name: 'a root-relative path', input: '/contact', expected: '/contact' },
  { name: 'a fragment link', input: '#faq', expected: '#faq' },
  {
    name: 'an uppercase scheme, matched case-insensitively and returned unaltered',
    input: 'HTTPS://Example.com',
    expected: 'HTTPS://Example.com',
  },
  {
    name: 'a url whose space is already percent-encoded',
    input: 'https://ok.com/a%20b',
    expected: 'https://ok.com/a%20b',
  },
]

describe('safeUrl - accepted', () => {
  for (const testCase of URL_ACCEPTED) {
    it(`accepts ${testCase.name}`, () => {
      expect(safeUrl(testCase.input)).toBe(testCase.expected)
    })
  }
})

const URL_REJECTED: ReadonlyArray<UrlCase> = [
  { name: 'a javascript: url', input: 'javascript:alert(1)', expected: null },
  { name: 'a mixed-case JavaScript: url', input: 'JavaScript:alert(1)', expected: null },
  {
    name: 'a tab-obfuscated javascript: url',
    input: 'java\tscript:alert(1)',
    expected: null,
  },
  {
    name: 'a newline-obfuscated javascript: url',
    input: 'java\nscript:alert(1)',
    expected: null,
  },
  {
    name: 'a NUL-obfuscated javascript: url',
    input: 'java\u0000script:alert(1)',
    expected: null,
  },
  { name: 'a leading-space javascript: url', input: '  javascript:alert(1)', expected: null },
  {
    name: 'a data: url carrying base64 html',
    input: 'data:text/html;base64,PHNjcmlwdD4=',
    expected: null,
  },
  { name: 'a vbscript: url', input: 'vbscript:msgbox(1)', expected: null },
  { name: 'a file: url', input: 'file:///etc/passwd', expected: null },
  {
    name: 'a bare relative link, which resolves wrongly under /about/index.html',
    input: 'about',
    expected: null,
  },
  { name: 'an empty string', input: '', expected: null },
  { name: 'a whitespace-only string', input: '   ', expected: null },
  { name: 'null', input: null, expected: null },
  { name: 'undefined', input: undefined, expected: null },
  { name: 'a number', input: 42, expected: null },
  { name: 'an object', input: {}, expected: null },
  { name: 'an array', input: [], expected: null },
]

describe('safeUrl - rejected, so the caller drops the link rather than emitting it', () => {
  for (const testCase of URL_REJECTED) {
    it(`rejects ${testCase.name}`, () => {
      expect(safeUrl(testCase.input)).toBeNull()
    })
  }
})

/**
 * WHATWG URL parsing treats a backslash as a slash in the authority position, so every one of
 * these navigates a visitor off the tenant's live domain while reading like an internal path.
 */
const URL_OFF_ORIGIN: ReadonlyArray<NamedInput> = [
  { name: 'two forward slashes', input: '//evil.com' },
  { name: 'slash then backslash', input: '/\\evil.com' },
  { name: 'backslash then slash', input: '\\/evil.com' },
  { name: 'two backslashes', input: '\\\\evil.com' },
  { name: 'two forward slashes with a path', input: '//evil.com/x' },
  { name: 'slash-backslash with a path', input: '/\\evil.com/path' },
  { name: 'slash-backslash-slash', input: '/\\/evil.com' },
  { name: 'backslash-backslash with a path', input: '\\\\evil.com/x' },
  { name: 'two forward slashes with a query', input: '//evil.com?x=1' },
  { name: 'slash-backslash with credentials', input: '/\\user@evil.com' },
]

describe('safeUrl - protocol-relative, in every slash and backslash combination', () => {
  for (const testCase of URL_OFF_ORIGIN) {
    it(`rejects ${testCase.name}`, () => {
      expect(safeUrl(testCase.input)).toBeNull()
    })
  }

  it('proves every rejected form really does resolve off-origin in a real URL parser', () => {
    const stillOnOrigin = URL_OFF_ORIGIN.filter(
      (testCase) =>
        new URL(testCase.input, 'https://tenant.sahoda.site/page').host === 'tenant.sahoda.site',
    )

    expect(stillOnOrigin).toEqual([])
  })

  it('still accepts an ordinary root-relative path', () => {
    expect(safeUrl('/pricing')).toBe('/pricing')
  })
})

/**
 * Deny-by-default, asserted as a whole set rather than by enumerating a few denials: adding a
 * scheme to ALLOWED_SCHEMES has to fail a test, not slip through because nobody listed it.
 */
const ACCEPTED_SCHEMES: ReadonlyArray<string> = ['http', 'https', 'mailto', 'tel']

const PROBED_SCHEMES: ReadonlyArray<string> = [
  ...ACCEPTED_SCHEMES,
  'ftp',
  'ftps',
  'file',
  'ws',
  'wss',
  'chrome',
  'chrome-extension',
  'blob',
  'data',
  'javascript',
  'vbscript',
  'view-source',
  'sftp',
  'ssh',
  'smb',
  'telnet',
  'gopher',
  'jar',
  'intent',
  'market',
  'itms-apps',
  'ms-msdt',
  'callto',
  'skype',
  'feed',
  'res',
  'sms',
  'geo',
]

describe('safeUrl - the scheme allowlist is deny-by-default', () => {
  for (const scheme of PROBED_SCHEMES) {
    const isAccepted = ACCEPTED_SCHEMES.includes(scheme)

    it(`${isAccepted ? 'accepts' : 'rejects'} the ${scheme}: scheme`, () => {
      const url = `${scheme}:example.com/x`

      expect(safeUrl(url)).toBe(isAccepted ? url : null)
    })
  }

  it('accepts exactly four schemes, so widening the allowlist breaks this test', () => {
    const accepted = PROBED_SCHEMES.filter((scheme) => safeUrl(`${scheme}:example.com/x`) !== null)

    expect(accepted).toEqual(ACCEPTED_SCHEMES)
  })

  it('rejects an unknown scheme nobody thought to enumerate', () => {
    expect(safeUrl('sahoda-internal:secrets')).toBeNull()
  })
})

describe('safeUrl - the 2048-character cap', () => {
  const PREFIX = 'https://example.com/'
  const atLimit = PREFIX + 'a'.repeat(2048 - PREFIX.length)
  const overLimit = PREFIX + 'a'.repeat(2049 - PREFIX.length)

  it('accepts a url of exactly 2048 characters', () => {
    expect(atLimit.length).toBe(2048)
    expect(safeUrl(atLimit)).toBe(atLimit)
  })

  it('rejects a url one character over the cap', () => {
    expect(overLimit.length).toBe(2049)
    expect(safeUrl(overLimit)).toBeNull()
  })

  it('rejects an inlined-asset-sized url far past the cap', () => {
    expect(safeUrl(`${PREFIX}${'a'.repeat(50_000)}`)).toBeNull()
  })

  it('measures the cap after trimming, so surrounding whitespace does not consume budget', () => {
    expect(safeUrl(`  ${atLimit}  `)).toBe(atLimit)
  })
})

/**
 * A URL carrying whitespace or an invisible character is rejected, never repaired: silently
 * closing the gap in `https://ok.com/a b` produces a working link to a page nobody authored.
 */
describe('safeUrl - whitespace and invisible characters are rejected, not silently removed', () => {
  const EMBEDDED: ReadonlyArray<NamedInput> = [
    { name: 'a space', input: 'https://ok.com/a b' },
    { name: 'a tab', input: 'https://ok.com/a\tb' },
    { name: 'a newline', input: 'https://ok.com/a\nb' },
    { name: 'a non-breaking space', input: 'https://ok.com/a\u00A0b' },
    { name: 'a zero-width space', input: 'https://ok.com/a\u200Bb' },
    { name: 'a zero-width joiner', input: 'https://ok.com/a\u200Db' },
    { name: 'a right-to-left override', input: 'https://ok.com/a\u202Eb' },
    { name: 'a byte-order mark', input: 'https://ok.com/a\uFEFFb' },
    { name: 'a unicode tag character', input: 'https://ok.com/a\u{E0041}b' },
    { name: 'a lone surrogate', input: 'https://ok.com/a\uD800b' },
  ]

  for (const testCase of EMBEDDED) {
    it(`rejects a url containing ${testCase.name}`, () => {
      expect(safeUrl(testCase.input)).toBeNull()
    })
  }

  it('does not mangle a valid url into a different valid url', () => {
    expect(safeUrl('https://ok.com/a b')).not.toBe('https://ok.com/ab')
  })

  it('trims surrounding whitespace, which cannot change where the url points', () => {
    expect(safeUrl('  https://ok.com/a  ')).toBe('https://ok.com/a')
  })

  it('trims a surrounding newline left by model output', () => {
    expect(safeUrl('\nhttps://ok.com/a\n')).toBe('https://ok.com/a')
  })
})

/**
 * India-market phone formatting and multi-word mail subjects both rely on a bare space, so
 * `mailto:` and `tel:` are the one carve-out from "no whitespace in a URL". `http:`/`https:`
 * keep the strict rule -- a space there resolves to a different page under RFC 3986 -- and the
 * carve-out is scoped by scheme, not by content: it only ever applies once the scheme has
 * already been matched to exactly `mailto:` or `tel:`, so a scheme-laundering payload can never
 * reach it.
 */
describe('safeUrl - mailto: and tel: permit a bare space; http/https do not', () => {
  it('accepts a tel: link formatted with spaces, the norm for Indian phone numbers', () => {
    expect(safeUrl('tel:+91 98765 43210')).toBe('tel:+91 98765 43210')
  })

  it('accepts a mailto: link with a multi-word subject in the query string', () => {
    expect(safeUrl('mailto:hi@sahoda.com?subject=Hello there')).toBe(
      'mailto:hi@sahoda.com?subject=Hello there',
    )
  })

  it('still rejects a space in an http: url', () => {
    expect(safeUrl('http://example.com/a b')).toBeNull()
  })

  it('still rejects a space in an https: url', () => {
    expect(safeUrl('https://example.com/a b')).toBeNull()
  })

  it('still rejects the tab-obfuscated javascript: url', () => {
    expect(safeUrl('java\tscript:alert(1)')).toBeNull()
  })

  it('still rejects a space-obfuscated javascript: url', () => {
    expect(safeUrl('java script:alert(1)')).toBeNull()
  })

  it('still rejects a zero-width-space-obfuscated javascript: url', () => {
    expect(safeUrl('java\u200Bscript:alert(1)')).toBeNull()
  })
})

// -- stripControl -----------------------------------------------------------------

const STRIP_CASES: ReadonlyArray<StringCase> = [
  { name: 'a right-to-left override', input: '\u202Egnp.exe', expected: 'gnp.exe' },
  { name: 'a left-to-right isolate pair', input: '\u2066abc\u2069', expected: 'abc' },
  { name: 'an arabic letter mark', input: 'a\u061Cb', expected: 'ab' },
  { name: 'a zero-width space', input: 'a\u200Bb', expected: 'ab' },
  { name: 'a byte-order mark', input: 'a\uFEFFb', expected: 'ab' },
  { name: 'a NUL byte', input: 'a\u0000b', expected: 'ab' },
  { name: 'a bell character', input: 'a\u0007b', expected: 'ab' },
  { name: 'a C1 control', input: 'a\u009Fb', expected: 'ab' },
]

describe('stripControl', () => {
  for (const testCase of STRIP_CASES) {
    it(`strips ${testCase.name}`, () => {
      expect(stripControl(testCase.input)).toBe(testCase.expected)
    })
  }

  it('keeps ordinary whitespace, which is legitimate in body copy', () => {
    expect(stripControl('one\ntwo\tthree\r\nfour')).toBe('one\ntwo\tthree\r\nfour')
  })
})

/**
 * The control ranges are asserted exhaustively rather than by sampling, so turning any `-` in
 * CONTROL_CHARS into a literal -- which drops a whole range -- fails a test.
 */
describe('stripControl - every control code point, not a sample', () => {
  it('strips every C0 and C1 code point except tab, newline and carriage return', () => {
    const survivors: string[] = []

    for (let code = 0x00; code <= 0x9f; code += 1) {
      const isKeptWhitespace = code === 0x09 || code === 0x0a || code === 0x0d
      const isPrintableAscii = code >= 0x20 && code <= 0x7e
      if (isKeptWhitespace || isPrintableAscii) continue

      if (stripControl(`a${String.fromCharCode(code)}b`) !== 'ab') {
        survivors.push(`U+${code.toString(16).toUpperCase().padStart(4, '0')}`)
      }
    }

    expect(survivors).toEqual([])
  })

  it('keeps tab, newline and carriage return, which are legitimate in copy', () => {
    for (const code of [0x09, 0x0a, 0x0d]) {
      expect(stripControl(`a${String.fromCharCode(code)}b`)).toHaveLength(3)
    }
  })

  it('keeps every printable ASCII character', () => {
    const removed: string[] = []

    for (let code = 0x20; code <= 0x7e; code += 1) {
      const char = String.fromCharCode(code)
      if (stripControl(char) !== char) removed.push(char)
    }

    expect(removed).toEqual([])
  })
})

/**
 * Invisible-text smuggling: characters that occupy no width but survive copy-paste, review and
 * a diff. All of them are removed before copy reaches a customer's page.
 */
const INVISIBLE_CASES: ReadonlyArray<NamedInput> = [
  { name: 'a zero-width space (U+200B)', input: 'a\u200Bb' },
  { name: 'an arabic letter mark (U+061C)', input: 'a\u061Cb' },
  { name: 'a left-to-right mark (U+200E)', input: 'a\u200Eb' },
  { name: 'a right-to-left mark (U+200F)', input: 'a\u200Fb' },
  { name: 'a left-to-right embedding (U+202A)', input: 'a\u202Ab' },
  { name: 'a right-to-left embedding (U+202B)', input: 'a\u202Bb' },
  { name: 'a pop directional formatting (U+202C)', input: 'a\u202Cb' },
  { name: 'a left-to-right override (U+202D)', input: 'a\u202Db' },
  { name: 'a right-to-left override (U+202E)', input: 'a\u202Eb' },
  { name: 'a word joiner (U+2060)', input: 'a\u2060b' },
  { name: 'an invisible times (U+2062)', input: 'a\u2062b' },
  { name: 'an invisible plus (U+2064)', input: 'a\u2064b' },
  { name: 'a left-to-right isolate (U+2066)', input: 'a\u2066b' },
  { name: 'a right-to-left isolate (U+2067)', input: 'a\u2067b' },
  { name: 'a first-strong isolate (U+2068)', input: 'a\u2068b' },
  { name: 'a pop directional isolate (U+2069)', input: 'a\u2069b' },
  { name: 'an inhibit symmetric swapping (U+206A)', input: 'a\u206Ab' },
  { name: 'a nominal digit shapes (U+206F)', input: 'a\u206Fb' },
  { name: 'a mongolian vowel separator (U+180E)', input: 'a\u180Eb' },
  { name: 'an interlinear annotation anchor (U+FFF9)', input: 'a\uFFF9b' },
  { name: 'an interlinear annotation terminator (U+FFFB)', input: 'a\uFFFBb' },
  { name: 'a byte-order mark (U+FEFF)', input: 'a\uFEFFb' },
  { name: 'a unicode tag space (U+E0020)', input: 'a\u{E0020}b' },
  { name: 'a unicode tag letter (U+E0041)', input: 'a\u{E0041}b' },
  { name: 'a unicode tag cancel (U+E007F)', input: 'a\u{E007F}b' },
  { name: 'a unicode tag range start (U+E0000)', input: 'a\u{E0000}b' },
]

describe('stripControl - invisible-text smuggling', () => {
  for (const testCase of INVISIBLE_CASES) {
    it(`removes ${testCase.name}`, () => {
      expect(stripControl(testCase.input)).toBe('ab')
    })
  }

  it('removes a whole hidden message written in the unicode tag block', () => {
    const hidden = 'Contact us\u{E0041}\u{E0042}\u{E0043}\u{E007F}'

    expect(stripControl(hidden)).toBe('Contact us')
  })
})

/**
 * FOUNDER RULING: ZWJ and ZWNJ are letters, not decoration. Stripping them breaks emoji
 * sequences and Devanagari/Urdu/Persian rendering, and Hindi copy is on the roadmap.
 */
const PRESERVED_CASES: ReadonlyArray<NamedInput> = [
  {
    name: 'a ZWJ family emoji sequence',
    input: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}',
  },
  { name: 'a ZWJ rainbow flag', input: '\u{1F3F3}\uFE0F\u200D\u{1F308}' },
  { name: 'a ZWJ woman-scientist emoji', input: '\u{1F469}\u200D\u{1F52C}' },
  {
    name: 'a Devanagari half-form written with ZWNJ',
    input: '\u0915\u094D\u200C\u0937',
  },
  {
    name: 'a Persian word joined with ZWNJ',
    input: '\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645',
  },
  { name: 'an emoji with a variation selector', input: '\u2764\uFE0F' },
  { name: 'plain Hindi copy', input: '\u0928\u092E\u0938\u094D\u0924\u0947' },
]

describe('stripControl - ZWJ and ZWNJ survive, because they are letters', () => {
  for (const testCase of PRESERVED_CASES) {
    it(`leaves ${testCase.name} intact`, () => {
      expect(stripControl(testCase.input)).toBe(testCase.input)
    })
  }

  it('keeps a bare zero-width joiner', () => {
    expect(stripControl('a\u200Db')).toBe('a\u200Db')
  })

  it('keeps a bare zero-width non-joiner', () => {
    expect(stripControl('a\u200Cb')).toBe('a\u200Cb')
  })

  it('removes a bidi override standing beside an emoji sequence it must not touch', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'

    expect(stripControl(`${family}\u202Egnp.exe`)).toBe(`${family}gnp.exe`)
  })

  it('carries the same preservation through escapeHtml and escapeAttr', () => {
    const devanagari = '\u0915\u094D\u200C\u0937'

    expect(escapeHtml(devanagari)).toBe(devanagari)
    expect(escapeAttr(devanagari)).toBe(devanagari)
  })
})

/**
 * Lone surrogates have no UTF-8 encoding. Written into a page file they become U+FFFD, so they
 * are removed here rather than allowed to corrupt a deployed document.
 */
describe('stripControl - unpaired surrogates', () => {
  it('drops a lone high surrogate', () => {
    expect(escapeHtml('a\uD800b')).toBe('ab')
  })

  it('drops a lone low surrogate', () => {
    expect(escapeHtml('a\uDC00b')).toBe('ab')
  })

  it('drops a lone surrogate in attribute context too', () => {
    expect(escapeAttr('a\uDBFFb')).toBe('ab')
  })

  it('keeps a well-formed surrogate pair, which is an ordinary emoji', () => {
    expect(escapeHtml('a\u{1F600}b')).toBe('a\u{1F600}b')
  })

  it('keeps a pair that sits directly beside a lone surrogate', () => {
    expect(escapeHtml('\uD800\u{1F600}')).toBe('\u{1F600}')
  })

  it('round-trips through UTF-8 unchanged, which the raw input would not', () => {
    const escaped = escapeHtml('a\uD800b')

    expect(Buffer.from(escaped, 'utf8').toString('utf8')).toBe(escaped)
    expect(Buffer.from('a\uD800b', 'utf8').toString('utf8')).not.toBe('a\uD800b')
  })
})

/**
 * The source of the security gate is stored as pure ASCII escape-sequence text. A raw control
 * byte makes git classify the blob as binary, which costs the team `git diff` and `git blame`
 * on the one file where review matters most. That happened once; it fails a test now.
 */
describe('escape module source is text, not binary', () => {
  const SOURCES: ReadonlyArray<string> = ['./escape.ts', './escape.test.ts']

  for (const source of SOURCES) {
    it(`stores ${source} as pure ASCII`, () => {
      const contents = readFileSync(new URL(source, import.meta.url), 'utf8')
      const offenders = [...contents]
        .map((char, index) => ({ index, code: char.codePointAt(0) ?? 0 }))
        .filter((entry) => entry.code > 0x7f)
        .map((entry) => `U+${entry.code.toString(16).toUpperCase()} at ${entry.index}`)

      expect(offenders).toEqual([])
    })

    it(`stores ${source} with no raw control byte git would read as binary`, () => {
      const contents = readFileSync(new URL(source, import.meta.url), 'utf8')
      const controls = [...contents].filter((char) => {
        const code = char.codePointAt(0) ?? 0
        return code < 0x20 && code !== 0x09 && code !== 0x0a
      })

      expect(controls).toEqual([])
    })
  }
})
