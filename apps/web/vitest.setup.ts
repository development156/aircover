import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Each test gets a clean document — a leaked tree makes `getByRole` ambiguous
// in ways that look like component bugs.
afterEach(cleanup)
