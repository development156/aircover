'use client'

import { MenuItemRow } from '@/components/assets/menu-item-row'

/**
 * THREE SHAPES, SHARED BY THE FOLDER MENU AND THE FILE MENU.
 *
 * `folder-menu-modes.tsx` and `file-menu-modes.tsx` each carried their own
 * near-identical rename form, picker list and confirm dialog — a folder and
 * a file rename to the same input, move to the same scrollable list of
 * names, and delete behind the same "are you sure" shape. One copy of each
 * here instead of two, which is also why `/assets`'s own JS budget needed
 * this pass: repeating the same Tailwind class strings twice is bytes a
 * customer downloads for a distinction that does not exist in the markup.
 */

export function RenameForm({
  id,
  label,
  name,
  maxLength,
  placeholder,
  submitLabel = 'Save',
  onNameChange,
  pending,
  onCancel,
  onSubmit,
}: {
  id: string
  label: string
  name: string
  maxLength: number
  placeholder?: string
  submitLabel?: string
  onNameChange: (value: string) => void
  pending: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="flex flex-col gap-2 p-1"
    >
      <label className="type-meta text-muted" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        autoFocus
        data-autofocus="true"
        value={name}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onNameChange(event.target.value)}
        className="h-8 rounded-sm border border-line bg-bg px-2 type-sm text-ink placeholder:text-muted"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="type-sm text-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || name.trim() === ''}
          className="type-sm font-semibold text-accent disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

export interface PickerOption {
  /** `null` is the synthetic "Top level" a folder's own Move offers. */
  id: string | null
  name: string
}

export function FolderPickerList({
  heading,
  options,
  emptyMessage,
  onPick,
}: {
  heading: string
  options: readonly PickerOption[]
  emptyMessage: string
  onPick: (id: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1 p-1">
      <p className="type-meta text-muted">{heading}</p>
      <div className="max-h-[220px] overflow-y-auto">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 type-sm text-muted">{emptyMessage}</p>
        ) : (
          options.map((option, index) => (
            <MenuItemRow
              key={option.id ?? 'root'}
              onClick={() => onPick(option.id)}
              autoFocus={index === 0}
            >
              {option.name}
            </MenuItemRow>
          ))
        )}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  message,
  detail,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  message: string
  detail?: React.ReactNode
  confirmLabel: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="flex flex-col gap-2 p-1">
      <p className="type-sm text-ink">{message}</p>
      {detail ?? null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="type-sm text-muted">
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          data-autofocus="true"
          onClick={onConfirm}
          disabled={pending}
          className="type-sm font-semibold text-danger disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
