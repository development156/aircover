-- What came attached to a stored inbox message.
--
-- `apps/web/src/lib/zernio/webhook-store.ts` (insertMessage) already writes this
-- column and `lib/inbox/store-read.ts` already selects it; both landed on
-- 2026-09-06 ahead of the column, so every stored-thread read answered 42703
-- and rendered an empty thread. jsonb, never a child table: an attachment has
-- no life of its own, is never queried across messages, and Zernio's shape
-- (`type`, `url`, `payload`) is theirs to extend.
--
-- The `url` on Instagram and Facebook is a signed Meta CDN link that expires.
-- The renderer resolves those through Zernio's re-mint endpoint using the
-- message id and the attachment's position; the stored url is the fallback for
-- platforms whose links are stable, and the position is implicit in the array.
alter table inbox_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
