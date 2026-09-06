-- One lead per inbox conversation per workspace, enforced by the database.
--
-- `public.lead_from_conversation` checks for an existing row and then inserts
-- (20260821000100). Two presses a moment apart both pass the check, and the
-- audit of 2026-09-06 (IL-09) found the same conversation saved twice. The
-- partial unique index makes the second insert fail instead; the function's
-- own SELECT-first still answers the existing id in the ordinary case.
--
-- Partial on `source ->> 'kind' = 'inbox'`: site-form leads carry no
-- conversation and must stay free to repeat (a person may write twice).
create unique index if not exists leads_one_per_conversation_idx
  on leads (workspace_id, (source ->> 'conversation_ref'))
  where source ->> 'kind' = 'inbox' and source ->> 'conversation_ref' is not null;

-- The board reads a workspace's leads newest first.
create index if not exists leads_workspace_created_idx
  on leads (workspace_id, created_at desc);
