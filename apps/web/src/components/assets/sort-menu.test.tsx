import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SortMenu } from './sort-menu'
import { DEFAULT_SORT } from '@/lib/assets/sort-cards'

describe('F3: the sort menu', () => {
  it('shows the active choice, and picking another calls onSortChange with exactly that option', async () => {
    const onSortChange = vi.fn()
    const user = userEvent.setup()
    render(<SortMenu sort={DEFAULT_SORT} onSortChange={onSortChange} />)

    const select = screen.getByRole('combobox', { name: 'Sort' })
    expect(select).toHaveValue('added:desc')

    await user.selectOptions(select, 'size:asc')
    expect(onSortChange).toHaveBeenCalledWith({ field: 'size', direction: 'asc' })
  })
})
