import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { parseSearch } from '@sahoda/shared'

const createSmartFolder = vi.fn()
vi.mock('@/app/actions/asset-smart-folders', () => ({
  createSmartFolder: (...args: unknown[]) => createSmartFolder(...args),
}))

const { LibrarySearch } = await import('./library-search')

function Harness({ initial = '' }: { initial?: string }) {
  const [query, setQuery] = useState(initial)
  const parsed = parseSearch(query)
  const narrowing = parsed.rules.length > 0 || parsed.folderNames.length > 0 || parsed.text !== ''
  return (
    <LibrarySearch
      query={query}
      onQueryChange={setQuery}
      narrowing={narrowing}
      unusable={parsed.unusable}
      unresolvedFolderNames={[]}
      rules={parsed.rules}
      onSaved={() => {}}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('save this search', () => {
  it('is absent when the box is empty', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Save this search' })).not.toBeInTheDocument()
  })

  it('appears once the search narrows', () => {
    render(<Harness initial="type:image" />)
    expect(screen.getByRole('button', { name: 'Save this search' })).toBeInTheDocument()
  })

  it('calls createSmartFolder with the parsed rules once named and submitted', async () => {
    createSmartFolder.mockResolvedValue({
      ok: true,
      folder: {
        id: 's1',
        workspace_id: 'w',
        name: 'Big photos',
        query: { mode: 'all', rules: [] },
      },
    })
    const user = userEvent.setup()
    render(<Harness initial="size:>500kb" />)

    await user.click(screen.getByRole('button', { name: 'Save this search' }))
    await user.type(screen.getByLabelText('Name this search'), 'Big photos')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(createSmartFolder).toHaveBeenCalledWith('Big photos', {
      mode: 'all',
      rules: [{ field: 'bytes', op: 'over', value: 512_000 }],
    })
  })
})

describe('an unknown filter value', () => {
  it('shows what Sahoda knows, once per bad token', () => {
    render(<Harness initial="type:vidoe" />)
    // Scoped to the message itself: the hint row ALSO shows a "type:image"
    // example, so a bare `getByText` here would find two elements.
    const message = screen.getByRole('alert')
    expect(message).toHaveTextContent('type:vidoe')
    expect(message).toHaveTextContent(/type:image/)
  })
})

describe('the hint row', () => {
  it('is hidden until the box is focused or has text', () => {
    render(<Harness />)
    expect(screen.queryByText('type:image')).not.toBeInTheDocument()
  })

  it('shows every field example once the box has a query, and a click appends it', async () => {
    const user = userEvent.setup()
    render(<Harness initial="dusk" />)
    expect(screen.getByText('used:no')).toBeInTheDocument()
    await user.click(screen.getByText('used:no'))
    expect(screen.getByRole('searchbox')).toHaveValue('dusk used:no')
  })
})
