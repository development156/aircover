import type { OnboardingData } from '../store'

export interface StepProps {
  data: OnboardingData
  patch: (next: Partial<OnboardingData>) => void
}
