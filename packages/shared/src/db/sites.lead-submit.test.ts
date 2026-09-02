import { describe, expect, it } from 'vitest'

import { SiteLeadSubmitSchema } from './sites'

/**
 * The public contact form's request shape.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * A browser form posts EVERY field, and an empty field arrives as `''`, not as
 * an absent key. zod 4's `z.email().optional()` accepts a missing key and
 * refuses `''` as present-and-invalid, so a visitor who left email blank and
 * typed a phone number was answered `fields: ['email']` before the "leave one
 * or the other" rule was ever reached. The screen promised a choice the schema
 * did not allow. MEASURED 2026-09-02 with zod 4.4.3.
 */

const BASE = { site_slug: 'chai-and-chapters', turnstile_token: 'tok', website: '' }

describe('SiteLeadSubmitSchema treats a blank optional field as absent', () => {
  it('accepts a phone-only enquiry whose email field was left blank', () => {
    const parsed = SiteLeadSubmitSchema.safeParse({
      ...BASE,
      name: 'Asha',
      email: '',
      phone: '+91 98765 43210',
      message: '',
    })

    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.email).toBeUndefined()
    expect(parsed.data.message).toBeUndefined()
    expect(parsed.data.phone).toBe('+91 98765 43210')
  })

  it('accepts an email-only enquiry whose phone field was left blank', () => {
    const parsed = SiteLeadSubmitSchema.safeParse({ ...BASE, email: 'asha@example.com', phone: '' })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.phone).toBeUndefined()
    expect(parsed.data.email).toBe('asha@example.com')
  })

  it('treats whitespace-only as blank too, so "   " is not a phone number', () => {
    const parsed = SiteLeadSubmitSchema.safeParse({ ...BASE, email: '', phone: '   ' })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    // Both absent: the route's no_contact rule is what must answer, and it can
    // only do that if the schema hands it undefined rather than a blank string.
    expect(parsed.data.email).toBeUndefined()
    expect(parsed.data.phone).toBeUndefined()
  })

  it('still refuses an email that is present and malformed', () => {
    const parsed = SiteLeadSubmitSchema.safeParse({ ...BASE, email: 'not-an-email' })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues.map((i) => i.path.join('.'))).toEqual(['email'])
  })

  it('does not blank-coerce the honeypot: a filled website still fails', () => {
    const parsed = SiteLeadSubmitSchema.safeParse({ ...BASE, website: 'http://spam.example' })

    expect(parsed.success).toBe(false)
  })

  it('does not blank-coerce the token: an empty turnstile_token still fails', () => {
    const parsed = SiteLeadSubmitSchema.safeParse({ ...BASE, turnstile_token: '' })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues.map((i) => i.path.join('.'))).toEqual(['turnstile_token'])
  })
})
