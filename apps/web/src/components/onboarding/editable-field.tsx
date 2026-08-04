'use client'

import { useId } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface EditableFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  disabled?: boolean
}

/** A single inline-editable string leaf inside a Refine card. */
export function EditableField({ label, value, onChange, multiline, disabled }: EditableFieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[56px]"
        />
      ) : (
        <Input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}
