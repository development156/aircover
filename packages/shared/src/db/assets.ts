import { z } from 'zod'
import { ChannelSchema } from '../enums'

/**
 * The media library: `assets` (one row per file, owned by the WORKSPACE) and
 * `asset_usages` (which post uses which file).
 *
 * ── WHY `kind` IS NOT DERIVED FROM `mime` ────────────────────────────────────
 * A mime type says `image/jpeg`. A library filters on "a photo" — the thing a
 * person is looking for. The column is the answer to the second question, and
 * the DB carries a CHECK for exactly these three values, so the enum is stated
 * here rather than inferred from a prefix: `application/pdf` is a document and
 * `image/svg+xml` is not a photo, and a prefix test gets both wrong.
 *
 * TODAY ONLY `image` CAN BE WRITTEN HONESTLY. Every channel's `mediaTypes` in
 * the Constraint Engine lists four image types and nothing else, and
 * `sniffImage` recognises exactly those four — so a video or a document could be
 * stored but never published, and never verified. The enum keeps all three
 * because the COLUMN has all three; the upload path refuses anything it cannot
 * identify, which today means it only ever writes 'image'. See
 * `apps/web/src/lib/assets/kind.ts`.
 */
export const AssetKindSchema = z.enum(['image', 'video', 'document'])
export type AssetKind = z.infer<typeof AssetKindSchema>

// ── assets ───────────────────────────────────────────────────────────────────
export const AssetSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  storage_path: z.string(),
  kind: AssetKindSchema,
  mime: z.string().nullable(),
  /**
   * `bigint` in Postgres, and PostgREST serialises `bigint` as a JSON NUMBER,
   * not a string — so this parses as a number. It is `z.number().int()` rather
   * than `z.int()` because the column's range exceeds `int4`; a file bigger than
   * 2 GB is not something this product accepts, but a schema that would throw on
   * one is a schema that lies about the column.
   */
  bytes: z.number().int().nullable(),
  width: z.int().nullable(),
  height: z.int().nullable(),
  alt: z.string().nullable(),
  title: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  /**
   * When a person moved this file to the trash. `null` is the live library.
   *
   * ── WHY `.default(null)` AND NOT A BARE `.nullable()` ──────────────────────
   * The column arrives with its own migration, and the code that reads it ships
   * as one commit. A bare `.nullable()` would make every row unparseable in the
   * window where the code is live and the migration is not, and this file parses
   * PER ROW so that a bad row costs one tile: a required field missing from
   * every row costs the entire library, which is the worst possible failure for
   * a screen whose job is to show you your files.
   *
   * The default is NOT how the trash is enforced. The list query filters
   * `deleted_at is null` in SQL, and PostgREST raises `42703` for a column that
   * does not exist, so an unapplied migration surfaces as "Sahoda could not read
   * your library" rather than as a trash that silently holds nothing. This
   * default only stops that one honest failure from becoming two.
   */
  deleted_at: z.string().nullable().default(null),
  /**
   * SHA-256 of the file's exact bytes, for duplicate detection at upload.
   *
   * `.default(null)` for the reason `deleted_at` gives above: this file parses
   * PER ROW so a bad row costs one tile, and a required field missing in the
   * window between deploy and migration would cost the entire library.
   *
   * NULL for every row uploaded before the column existed. A NULL never
   * matches, so an older duplicate is simply not detected — and nothing claims
   * otherwise. The absence of a match is never rendered as "you have nothing
   * like this".
   */
  content_sha256: z.string().nullable().default(null),
})
export type Asset = z.infer<typeof AssetSchema>

export const AssetInsertSchema = z.object({
  workspace_id: z.uuid(),
  storage_path: z.string().min(1),
  kind: AssetKindSchema,
  mime: z.string().nullable().optional(),
  bytes: z.number().int().nullable().optional(),
  width: z.int().nullable().optional(),
  height: z.int().nullable().optional(),
  alt: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
})
export type AssetInsert = z.infer<typeof AssetInsertSchema>

/**
 * Only the two fields a person edits. `storage_path`, `kind`, `bytes` and the
 * dimensions are facts about the FILE, established by sniffing its bytes at
 * upload — nothing in the UI may overwrite them, so nothing here can express it.
 */
export const AssetUpdateSchema = z
  .object({
    alt: z.string().nullable(),
    title: z.string().nullable(),
  })
  .partial()
export type AssetUpdate = z.infer<typeof AssetUpdateSchema>

// ── asset_usages ─────────────────────────────────────────────────────────────
export const AssetUsageSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  asset_id: z.uuid(),
  post_id: z.uuid(),
  /** null means "the post as a whole", which is the ordinary case today. */
  channel: ChannelSchema.nullable(),
  position: z.int(),
  created_at: z.string(),
})
export type AssetUsage = z.infer<typeof AssetUsageSchema>

// ── asset_derivatives ────────────────────────────────────────────────────────
/**
 * A cropped copy of a library file.
 *
 * ── A DERIVATIVE IS A CHILD OF ITS ASSET, NOT A SECOND ASSET ────────────────
 * That is a security property, not a naming preference. The delete gate reads
 * `asset_usages`, which is derived from `post_media.asset_id` — so it can only
 * ever see an attachment that names its ORIGINAL. Had a crop been its own
 * `assets` row with `post_media.asset_id` pointing at it, deleting the original
 * would have found no usages, the trigger would have refused nothing, and a
 * scheduled post would have lost its photo silently. `post_media.asset_id`
 * therefore keeps naming the original and `derivative_id` says which crop of it
 * is attached; a CHECK forbids the second without the first.
 *
 * The original is never modified and never deleted to make one of these.
 */
export const AssetDerivativeSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  asset_id: z.uuid(),
  storage_path: z.string(),
  /**
   * Everything that determines the BYTES — the crop rectangle and the output
   * encoding. The idempotency key: re-running the same crop finds this row and
   * mints nothing. Deliberately excludes the channel set, because two channel
   * sets that resolve to the same rectangle produce the same file.
   */
  recipe: z.string(),
  /** Which channels this crop was cut for and verified against. */
  channels: z.array(ChannelSchema),
  /**
   * Which format each channel's version declared, as a channel -> format map.
   *
   * A MAP, not one value. A post can be an Instagram story and a LinkedIn post at
   * once, so a single `format` would be false for every channel but one — and
   * this row's whole job is to record which channel and which format a crop was
   * cut for. A channel whose version stated no intent is simply absent.
   *
   * ── `partialRecord`, AND `record` HERE WOULD HAVE BEEN A SILENT DATA BUG ───
   * Zod 4 made `z.record()` with an ENUM key EXHAUSTIVE — it requires a value
   * for every member — and moved the old partial behaviour to `partialRecord`.
   * So `z.record(ChannelSchema, …)` demands all four channels, and EVERY row
   * this feature writes has fewer: an Instagram-only crop has one key and the
   * column's own default is `{}`.
   *
   * MEASURED: `{instagram:'story'}` failed with three `invalid_type` issues for
   * x, gbp and linkedin. Typecheck could not see it — `formatMapFor` returns
   * `Record<string, string>`, assignable either way — and no database test
   * reaches it, because those insert through raw SQL and never take a row back
   * out through zod.
   *
   * The place it lands is the worst one available. `mintCroppedAttachment`
   * parses AFTER uploading the derivative and inserting the row, so the failure
   * would leave the bytes in the bucket and the row in the table, never write
   * `post_media`, and tell the person the crop did not work — a silent partial
   * success, which is the exact class this lane was written to close.
   */
  formats: z.partialRecord(ChannelSchema, z.string()),
  crop_x: z.int(),
  crop_y: z.int(),
  crop_w: z.int(),
  crop_h: z.int(),
  /** Where the person said the subject was, as fractions of the original. */
  focal_x: z.number(),
  focal_y: z.number(),
  /** Facts about the derivative FILE, sniffed from the bytes sharp produced. */
  mime: z.string(),
  bytes: z.number().int(),
  width: z.int(),
  height: z.int(),
  created_by: z.string().nullable(),
  created_at: z.string(),
})
export type AssetDerivative = z.infer<typeof AssetDerivativeSchema>
