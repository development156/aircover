import { ImageGenerateInputSchema, ImageGenerateOutputSchema, type MeshTaskDef } from '@sahoda/shared'
import type { ImageGenerateInput, ImageGenerateOutput } from '@sahoda/shared'

/**
 * `image_generate` — the def only.
 *
 * Every other task in this folder exports a `MeshTaskSpec` carrying a
 * `buildMessages` prompt builder, because every other task is a chat. This one has
 * no messages to build: the prompt IS the input and the runner's image path takes
 * it directly. What it still needs is the def, because telemetry keys off `name`
 * and `tier` exactly as it does for a text task.
 *
 * `maxTokens: 0` is honest rather than lazy — an image response carries no
 * completion tokens, and any number here would be a budget over nothing.
 */
export const imageGenerateDef: MeshTaskDef<ImageGenerateInput, ImageGenerateOutput> = {
  name: 'image_generate',
  tier: 'standard',
  inputSchema: ImageGenerateInputSchema,
  outputSchema: ImageGenerateOutputSchema,
  maxTokens: 0,
}
