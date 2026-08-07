import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { revalidateBalance } = await import('./revalidate-balance')
const { revalidatePath } = await import('next/cache')

afterEach(() => {
  vi.mocked(revalidatePath).mockClear()
})

describe('revalidateBalance', () => {
  test('revalidates the LAYOUT, not just a page — the credit chip lives there', () => {
    // A page-scoped revalidate leaves the topbar chip showing the pre-charge
    // balance until a manual reload: the user spends credits, sees the number
    // unchanged, and the obvious move is to click again.
    revalidateBalance()

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/', 'layout')
  })

  test('refreshes the wallet history too', () => {
    revalidateBalance()

    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/wallet')
  })

  test('never throws — a cache miss must not change an action outcome', () => {
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error('revalidate exploded')
    })

    expect(() => revalidateBalance()).not.toThrow()
  })
})
