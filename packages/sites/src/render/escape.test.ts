import { describe, it, expect } from 'vitest'
import { escapeHtml, escapeAttr, safeUrl, stripControl } from './escape'

interface StringCase {
  name: string
  input: string
  expected: string
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
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    )
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
]

describe('escapeHtml / escapeAttr - non-string input is coerced, never thrown on', () => {
  for (const testCase of COERCE_CASES) {
    it(`renders ${testCase.name} as ${JSON.stringify(testCase.expected)} in both contexts`, () => {
      expect(escapeHtml(testCase.input)).toBe(testCase.expected)
      expect(escapeAttr(testCase.input)).toBe(testCase.expected)
    })
  }
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
  { name: 'a tab-obfuscated javascript: url', input: 'java\tscript:alert(1)', expected: null },
  { name: 'a newline-obfuscated javascript: url', input: 'java\nscript:alert(1)', expected: null },
  { name: 'a NUL-obfuscated javascript: url', input: 'java\u0000script:alert(1)', expected: null },
  { name: 'a leading-space javascript: url', input: '  javascript:alert(1)', expected: null },
  {
    name: 'a data: url carrying base64 html',
    input: 'data:text/html;base64,PHNjcmlwdD4=',
    expected: null,
  },
  { name: 'a vbscript: url', input: 'vbscript:msgbox(1)', expected: null },
  { name: 'a protocol-relative url that would inherit the page scheme', input: '//evil.com/x', expected: null },
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

// -- stripControl -----------------------------------------------------------------

const STRIP_CASES: ReadonlyArray<StringCase> = [
  { name: 'a right-to-left override', input: '\u202Egnp.exe', expected: 'gnp.exe' },
  { name: 'a left-to-right isolate pair', input: '\u2066abc\u2069', expected: 'abc' },
  { name: 'an arabic letter mark', input: 'a\u061Cb', expected: 'ab' },
  { name: 'a zero-width space', input: 'a\u200Bb', expected: 'ab' },
  { name: 'a zero-width joiner', input: 'a\u200Db', expected: 'ab' },
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
