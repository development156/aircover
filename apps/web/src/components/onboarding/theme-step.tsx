'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Palette, RotateCcw, Sparkles } from 'lucide-react'

import type { SaveBrandState } from '@/app/actions/brand-resolve'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { extractPalette } from '@/lib/brand/color-extract'

import { LogoDrop, type LogoValue } from './logo-drop'

export interface ThemeStepProps {
  logo: LogoValue | null
  onLogoChange: (logo: LogoValue | null) => void
  /** Lifted to the parent so the persistent preview panel can reflect it too. */
  colors: string[] | null
  onColorsChange: (colors: string[] | null) => void
  onFinish: () => void
  saving: boolean
  /** null until Finish has been attempted. */
  saveState: SaveBrandState | null
}

function SavedPanel({ version, replayed }: { version: number; replayed: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-pill bg-ok-bg text-ok">
        <Check size={22} strokeWidth={1.7} aria-hidden />
      </span>
      <h2 className="text-[18px] font-bold text-ink">Your Brand Brain is live</h2>
      <p className="max-w-[44ch] text-[13.5px] text-muted">
        {replayed ? 'Already saved as' : 'Saved to your workspace as'} version{' '}
        <span className="font-semibold tabular-nums text-ink">{version}</span> — every post, plan
        and reply Sahoda writes from now on uses this voice.
      </p>
      <Link
        href="/home"
        data-guide="onboarding.go-home"
        className="mt-2 inline-flex items-center rounded-pill bg-primary px-4 py-[9px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white active:scale-[.97]"
      >
        Go to home
      </Link>
    </div>
  )
}

/**
 * Step 4 (Theme): extract dominant colors from the uploaded logo client-side.
 * The parent applies `colors` to the preview panel via `brandSkinVars` — this
 * component only reads/writes the logo + extracted palette; Finish hands the
 * edited brain to `saveBrandMemory` (resolve_brand_memory RPC) and reports the
 * real outcome — a failure keeps the user here with their edits intact.
 */
export function ThemeStep({
  logo,
  onLogoChange,
  colors,
  onColorsChange,
  onFinish,
  saving,
  saveState,
}: ThemeStepProps) {
  const [extracting, setExtracting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (!logo) {
      onColorsChange(null)
      return
    }
    let cancelled = false
    setExtracting(true)
    const img = new window.Image()
    img.onload = () => {
      if (cancelled) return
      onColorsChange(extractPalette(img))
      setExtracting(false)
    }
    img.onerror = () => {
      if (cancelled) return
      setExtracting(false)
    }
    img.src = logo.dataUrl
    return () => {
      cancelled = true
    }
    // onColorsChange is a stable setter from the parent; logo is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logo])

  if (saveState?.ok) return <SavedPanel version={saveState.version} replayed={saveState.replayed} />

  const themed = Boolean(colors && colors.length > 0)

  function revert() {
    onColorsChange(null)
    setAccepted(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[16px] font-bold text-ink">Theme it from your logo</p>
        <p className="mt-1 text-[13px] text-muted">
          Upload your logo and Sahoda re-colors the live preview on the right — nothing here is
          saved until you accept it.
        </p>
      </div>

      {!logo ? (
        <EmptyState
          icon={Palette}
          title="Add a logo to theme your preview"
          body="Sahoda reads its dominant colors and re-themes the preview live — entirely on this device."
          action={
            <LogoDrop value={logo} onChange={onLogoChange} guide="onboarding.theme-logo-upload" />
          }
          tip="You can skip this — the default Sahoda orange works fine too."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <LogoDrop value={logo} onChange={onLogoChange} guide="onboarding.theme-logo-upload" />

          <p
            aria-live="polite"
            className="min-h-[16px] font-mono text-[12px] font-semibold text-accent"
          >
            {extracting ? 'Reading your logo’s colors…' : null}
          </p>

          {themed ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold text-ink">Extracted palette</span>
              {colors!.map((color) => (
                <span
                  key={color}
                  style={{ background: color }}
                  className="size-6 rounded-pill border border-line"
                  aria-hidden
                />
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {accepted ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-ok-bg px-3 py-1.5 text-[13px] font-semibold text-ok">
                <Check size={14} aria-hidden /> Theme applied
              </span>
            ) : (
              <Button
                type="button"
                data-guide="onboarding.accept-theme"
                onClick={() => setAccepted(true)}
                disabled={!themed}
              >
                <Sparkles size={14} aria-hidden />
                Accept theme
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={revert} disabled={!themed}>
              <RotateCcw size={14} aria-hidden />
              Revert to default
            </Button>
          </div>
        </div>
      )}

      {saveState && !saveState.ok ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {saveState.message}
        </p>
      ) : null}

      <div className="flex justify-end border-t border-line pt-4">
        <Button type="button" data-guide="onboarding.finish" onClick={onFinish} disabled={saving}>
          {saving ? 'Saving…' : 'Finish setup'}
        </Button>
      </div>
    </div>
  )
}
