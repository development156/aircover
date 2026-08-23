import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkeletonBar } from '@/components/skeleton'
import { ComingSoon } from '@/components/design-system/coming-soon-chip'
import { DataTable } from '@/components/ui/data-table'
import { Tabs } from '@/components/ui/tabs'
import { Select } from '@/components/ui/select'
import { Tile } from '@/components/ui/tile'
import { Chip } from '@/components/ui/chip'
import { OverlayDemo, RemovableChipDemo } from '@/components/design-system/overlay-demo'

/**
 * Every primitive, in every state it ships with.
 *
 * States that only exist under a pointer — hover, active — are shown by a
 * FORCED class rather than by prose, so the page shows the actual pixels. Focus
 * is the exception: it is shown live, because a focus ring you cannot tab to is
 * exactly the bug this page should catch.
 */
export function PrimitiveRack() {
  return (
    <div className="grid gap-8">
      <Rack
        name="Button"
        note="One primary action per view. Everything else is secondary or ghost."
      >
        <Cell label="primary">
          <Button variant="primary">Create post</Button>
        </Cell>
        <Cell label="secondary">
          <Button variant="secondary">Save draft</Button>
        </Cell>
        <Cell label="ghost">
          <Button variant="ghost">Cancel</Button>
        </Cell>
        <Cell label="disabled">
          <Button variant="primary" disabled>
            Continue
          </Button>
        </Cell>
        <Cell label="focus (tab to it)">
          <Button variant="secondary">Focus me</Button>
        </Cell>
      </Rack>

      <Rack name="Input" note="38px tall, 44px at narrow widths. The label is never a placeholder.">
        <Cell label="rest">
          <Input aria-label="Post title" placeholder="Post title" />
        </Cell>
        <Cell label="filled">
          <Input aria-label="Filled" defaultValue="Diwali hamper pre-orders" />
        </Cell>
        <Cell label="disabled">
          <Input aria-label="Disabled" placeholder="Not editable" disabled />
        </Cell>
        <Cell label="invalid">
          <Input aria-label="Invalid" defaultValue="not-an-email" aria-invalid />
        </Cell>
      </Rack>

      <Rack name="Select" note="A native select, styled. Never a div pretending to be one.">
        <Cell label="rest">
          <Select aria-label="Channel" defaultValue="instagram">
            <option value="instagram">Instagram</option>
            <option value="linkedin">LinkedIn</option>
            <option value="gbp">Google Business Profile</option>
          </Select>
        </Cell>
        <Cell label="disabled">
          <Select aria-label="Disabled channel" disabled>
            <option>Instagram</option>
          </Select>
        </Cell>
      </Rack>

      <Rack
        name="Tabs"
        note="Underline marks the current tab; the word carries the state for a screen reader."
      >
        <Cell label="rest" wide>
          <Tabs
            label="Brand Brain sections"
            items={[
              { href: '#overview', label: 'Overview', current: true },
              { href: '#identity', label: 'Identity' },
              { href: '#voice', label: 'Voice & tone' },
              { href: '#audience', label: 'Audience' },
            ]}
          />
        </Cell>
      </Rack>

      <Rack
        name="Table"
        note="For anything a person scans down a column. A list of cards is not a table."
      >
        <Cell label="with rows" wide>
          <DataTable
            caption="Credit activity"
            columns={[
              { key: 'when', header: 'When' },
              { key: 'what', header: 'Activity' },
              { key: 'amount', header: 'Credits', numeric: true },
            ]}
            rows={[
              { when: '19 Aug 2026', what: 'Welcome credits', amount: '+100' },
              { when: '19 Aug 2026', what: 'Plan my week', amount: '−20' },
            ]}
          />
        </Cell>
        <Cell label="empty" wide>
          <DataTable
            caption="Credit activity, empty"
            columns={[
              { key: 'when', header: 'When' },
              { key: 'what', header: 'Activity' },
              { key: 'amount', header: 'Credits', numeric: true },
            ]}
            rows={[]}
            empty="Nothing spent yet. Your first AI action shows up here."
          />
        </Cell>
      </Rack>

      <Rack
        name="Loading"
        note="A skeleton stands in for the SHAPE that is coming, never for a spinner."
      >
        <Cell label="text" wide>
          <div className="grid gap-2">
            <SkeletonBar className="h-4 w-[220px]" />
            <SkeletonBar className="h-4 w-[320px]" />
          </div>
        </Cell>
      </Rack>

      <Rack
        name="Tile"
        note="A tile is a selectable OPTION. A card is a container. Selection shows in three ways (aria-pressed, a ring, and weight) because a tint alone is nearly invisible against its surface."
      >
        <Cell label="rest">
          <Tile title="Instagram" meta="Not connected" />
        </Cell>
        <Cell label="selected">
          <Tile title="LinkedIn" meta="Connected" selected />
        </Cell>
        <Cell label="disabled">
          {/* NOT "coming soon". A disabled tile is still a button, so it must
              only ever mean "this real option is temporarily unavailable" —
              something the user could fix. An unbuilt feature is a <span>
              (see the Coming soon rack), and the gallery's own guard caught
              this exact mistake when the tile was first labelled that way. */}
          <Tile title="Instagram" meta="Reconnect to use this" disabled />
        </Cell>
      </Rack>

      <Rack
        name="Chip"
        note="A chip is data the USER put there: a channel, a filter, a tag. A badge is a status the SYSTEM computed. Do not dress one as the other."
      >
        <Cell label="static">
          <Chip>Instagram</Chip>
        </Cell>
        <Cell label="removable">
          <RemovableChipDemo />
        </Cell>
      </Rack>

      <Rack
        name="Modal and drawer"
        note="Both are the native <dialog>, so the focus trap, Escape and the top layer come from the browser. A modal demands an answer; a drawer is consulted."
      >
        <Cell label="live" wide>
          <OverlayDemo />
        </Cell>
      </Rack>

      <Rack
        name="Coming soon"
        note="A DIV, never a disabled button. A disabled button is still announced as a button, so a screen reader offers an action that does not exist."
      >
        <Cell label="chip">
          <ComingSoon>Telegram</ComingSoon>
        </Cell>
      </Rack>
    </div>
  )
}

function Rack({ name, note, children }: { name: string; note: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="type-h3">{name}</h3>
      <p className="type-sm mt-0.5 mb-3 max-w-[70ch] text-muted">{note}</p>
      <div className="flex flex-wrap items-end gap-4 rounded-card border border-line-soft p-4">
        {children}
      </div>
    </div>
  )
}

function Cell({
  label,
  children,
  wide,
}: {
  label: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={wide ? 'w-full' : ''}>
      <p className="type-eyebrow mb-1.5 text-muted">{label}</p>
      {children}
    </div>
  )
}
