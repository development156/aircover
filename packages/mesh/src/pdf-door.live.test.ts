import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createMesh } from './mesh'
import { brandExtractTask } from './tasks/brand-extract'

/**
 * LIVE — makes a real model call and costs real tokens. Skipped unless
 * PDF_DOOR_LIVE=1.
 *
 * THE QUESTION. A text-layer PDF came back with zero fields, and the door
 * reported it as "if it is a scan, tell us in your own words" — a claim about
 * the DOCUMENT that may actually be a fault on our side. Reading the code cannot
 * settle it: `buildRequest` sets `pdfEngine` and `extraBody` turns that into a
 * `plugins` block, but whether that block reaches the wire, and what OpenRouter
 * does with it, is observable only by watching the socket.
 *
 * So this intercepts `fetch` and records the EXACT outgoing body and the raw
 * response, then asserts on both.
 *
 *   set -a; source .env; set +a
 *   PDF_DOOR_LIVE=1 npx vitest run --config vitest.live.config.ts src/pdf-door.live.test.ts
 */

const LIVE = process.env.PDF_DOOR_LIVE === '1'
const PDF = process.env.PDF_DOOR_FILE ?? '/tmp/brandbook.pdf'

interface Captured {
  url: string
  model?: string
  plugins?: unknown
  partTypes: string[]
  filenames: string[]
  status: number
  finishReason?: string
  usage?: unknown
  rawContent: string
}

describe.skipIf(!LIVE)('the upload door on the wire', () => {
  it('sends the file-parser plugin and reports what came back', async () => {
    const captured: Captured[] = []
    const realFetch = globalThis.fetch

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input)
      if (!url.includes('openrouter.ai')) return realFetch(input, init)

      const body = JSON.parse(String(init?.body ?? '{}'))
      const userTurn = (body.messages ?? []).at(-1) ?? {}
      const parts = Array.isArray(userTurn.content) ? userTurn.content : []

      const res = await realFetch(input, init)
      const text = await res.clone().text()
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(text)
      } catch {
        /* leave empty; rawContent below carries the truth */
      }
      const choice = (
        parsed.choices as { message?: { content?: string }; finish_reason?: string }[]
      )?.[0]

      captured.push({
        url,
        model: body.model,
        plugins: body.plugins,
        partTypes: parts.map((p: { type?: string }) => String(p.type)),
        filenames: parts
          .filter((p: { type?: string }) => p.type === 'file')
          .map((p: { file?: { filename?: string } }) => String(p.file?.filename)),
        status: res.status,
        finishReason: choice?.finish_reason,
        usage: parsed.usage,
        rawContent: choice?.message?.content ?? String(parsed.error ?? text).slice(0, 600),
      })
      return res
    }) as typeof fetch

    try {
      const dataUrl = `data:application/pdf;base64,${readFileSync(PDF).toString('base64')}`
      const mesh = createMesh()
      const result = await mesh.runTask(
        brandExtractTask.def,
        {
          name: 'Rolling Pin Bakehouse',
          file: {
            filename: 'brandbook.pdf',
            dataUrl,
            ...(process.env.PDF_DOOR_ENGINE
              ? { engine: process.env.PDF_DOOR_ENGINE as 'mistral-ocr' }
              : {}),
          },
        },
        { workspaceId: 'probe', traceId: 'probe', userId: 'probe' },
      )

      const wire = captured[0]
      if (process.env.PDF_DOOR_OUT) {
        writeFileSync(process.env.PDF_DOOR_OUT, JSON.stringify({ wire, result }, null, 2))
      }
      console.log('\n───────── WIRE ─────────')
      console.log('model        :', wire?.model)
      console.log('plugins      :', JSON.stringify(wire?.plugins))
      console.log('content parts:', JSON.stringify(wire?.partTypes), wire?.filenames)
      console.log('───────── RESPONSE ─────────')
      console.log('http         :', wire?.status)
      console.log('finish_reason:', wire?.finishReason)
      console.log('usage        :', JSON.stringify(wire?.usage))
      console.log('raw content  :', String(wire?.rawContent).slice(0, 900))
      console.log('───────── PARSED ─────────')
      console.log('ok           :', result.ok)
      if (result.ok) {
        console.log('fields       :', result.data.fields.length)
        console.log(JSON.stringify(result.data.fields, null, 2).slice(0, 1500))
        console.log('gaps         :', JSON.stringify(result.data.gaps))
      } else {
        console.log('error        :', JSON.stringify(result.error).slice(0, 500))
      }

      // The claim under test: the plugin block reached the wire, with the free
      // engine spelled out, alongside a file part.
      expect(wire, 'no OpenRouter call was made at all').toBeDefined()
      expect(wire!.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }])
      expect(wire!.partTypes).toContain('file')
    } finally {
      globalThis.fetch = realFetch
    }
  }, 180_000)
})
