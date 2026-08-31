import { z } from 'zod'

import { MAX_REFERENCES } from './modes'

/**
 * THE PICTURES A REQUEST SAYS TO LOOK AT.
 *
 * ── WHY THIS IS ITS OWN FILE ────────────────────────────────────────────────
 * A `'use server'` module may export only async functions, so a schema declared
 * beside the action cannot be imported by a test. This rule decides how many
 * paid provider calls carry how many pictures and what a row records as
 * provenance, which makes it exactly the kind of rule that has to be testable.
 *
 * ── DE-DUPLICATED BEFORE THE BOUND IS CHECKED ───────────────────────────────
 * The screen cannot produce a duplicate; a hand-made request can. Without this,
 * `[id, id, id]` passes the bound, is STORED on the row as three references, and
 * is sent to the provider three times. The row then claims a provenance that is
 * not true, and somebody is charged for a call carrying one picture described as
 * three.
 *
 * Deduplicated FIRST and bounded after, so five copies of one picture are one
 * reference rather than a refusal. Somebody who sent that meant one.
 *
 * ── AND ORDER SURVIVES IT ───────────────────────────────────────────────────
 * References are not commutative: they are sent in pick order and the first
 * weighs most, which is why the picker shows the position rather than a tick. A
 * `Set` keeps first-seen order, so the picture somebody chose first stays first.
 */
export const ReferenceIdsSchema = z
  .array(z.uuid())
  .default([])
  .transform((ids) => [...new Set(ids)])
  .refine((ids) => ids.length <= MAX_REFERENCES, {
    message: 'too many references',
  })
