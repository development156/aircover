import { BrainSections } from '@/components/brain/brain-sections'

export const metadata = { title: 'Identity' }

/**
 * Who the brand is, what it promises, and who it speaks to.
 *
 * The sections rendered here are a SUBSET of BRAIN_SECTIONS, split by what they
 * describe rather than by anything new — no field moved, no field was added, and
 * the flat grid this replaces showed all five with no way to tell which was
 * which.
 */
// `BrainSections` is itself an async server component, so it is CALLED and
// awaited rather than returned as an element: returning <BrainSections/> hands
// the caller an unresolved promise child, which renders as nothing under test.
export default async function BrainIdentityPage() {
  return BrainSections({ only: ['brand_persona', 'hook', 'customer_persona'] })
}
