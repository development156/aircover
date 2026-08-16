import { BrainSections } from '@/components/brain/brain-sections'

export const metadata = { title: 'Voice & Tone' }

/**
 * How it sounds, and what it steers away from.
 *
 * The sections rendered here are a SUBSET of BRAIN_SECTIONS, split by what they
 * describe rather than by anything new — no field moved, no field was added, and
 * the flat grid this replaces showed all five with no way to tell which was
 * which.
 */
// Called and awaited, not returned as an element — see identity/page.tsx.
export default async function BrainVoicePage() {
  return BrainSections({ only: ['voice', 'taboo'] })
}
