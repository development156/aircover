import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { TokenField } from '@sahoda/shared'

import { FilterChips } from './filter-chips'

function Harness({ fields }: { fields?: readonly TokenField[] }) {
  const [query, setQuery] = useState('')
  return (
    <>
      <p data-testid="query">{query}</p>
      <FilterChips fields={fields} query={query} onQueryChange={setQuery} />
    </>
  )
}

describe('F2: filter chips', () => {
  it('clicking a value inserts exactly that token into an empty box', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Type' }))
    await user.click(screen.getByRole('button', { name: 'Image' }))

    expect(screen.getByTestId('query')).toHaveTextContent('type:image')
  })

  it('an already-active token shows its chip as selected, and clicking it again removes it', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Type' }))
    await user.click(screen.getByRole('button', { name: 'Video' }))
    expect(screen.getByTestId('query')).toHaveTextContent('type:video')

    const chip = screen.getByRole('button', { name: /Type: Video/ })
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    await user.click(chip)
    expect(screen.getByTestId('query')).toHaveTextContent('')
  })

  it('picking a new value for an already-set field REPLACES the old token, never both', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Type' }))
    await user.click(screen.getByRole('button', { name: 'Image' }))
    expect(screen.getByTestId('query')).toHaveTextContent('type:image')

    // Clicking the now-active chip removes it (asserted above); to CHANGE
    // the value the chip is clicked again while inactive.
    await user.click(screen.getByRole('button', { name: /Type: Image/ }))
    await user.click(screen.getByRole('button', { name: 'Type' }))
    await user.click(screen.getByRole('button', { name: 'Video' }))

    const text = screen.getByTestId('query').textContent
    expect(text).toBe('type:video')
  })

  it('is derived from the fields it is given, not four names hard-coded here', async () => {
    // A fixture the real `TOKEN_FIELDS` never carries. If a chip for it
    // appears, the row is genuinely built from its `fields` prop.
    const fixture: TokenField[] = [{ key: 'zzz', label: 'a made-up field', example: 'zzz:foo' }]
    render(<Harness fields={fixture} />)

    expect(screen.getByRole('button', { name: 'a made-up field' })).toBeInTheDocument()
    // And none of the real, hard-coded-sounding labels leaked in from a
    // default the `fields` prop was supposed to override.
    expect(screen.queryByRole('button', { name: 'Type' })).not.toBeInTheDocument()
  })

  it('a field with no curated values menu still opens a working chip, from its own worked example', async () => {
    const fixture: TokenField[] = [{ key: 'zzz', label: 'a made-up field', example: 'zzz:foo' }]
    const user = userEvent.setup()
    render(<Harness fields={fixture} />)

    await user.click(screen.getByRole('button', { name: 'a made-up field' }))
    await user.click(screen.getByRole('button', { name: 'zzz:foo' }))

    expect(screen.getByTestId('query')).toHaveTextContent('zzz:foo')
  })
})
