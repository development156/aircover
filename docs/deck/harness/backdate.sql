-- apply_ledger_entry stamps created_at = now(), so a seeded history all lands on one
-- day and the 30-day spend trend has a single point. The ledger is append-only by
-- TRIGGER (app.block_mutations), which is exactly right in production and is the one
-- thing standing between a seed and a believable chart.
--
-- This is the throwaway box: disable the guard, spread the history, put the guard
-- back. Nothing else may ever do this.

alter table credit_ledger disable trigger user;

-- Spread by seq across the last 34 days, so grants sit at the start of the cycle and
-- spends accumulate through it. Deterministic, no randomness.
update credit_ledger
set created_at = case
    when entry_type = 'GRANT'  and action_type = 'signup_grant' then now() - interval '190 days'
    when entry_type = 'GRANT'  and action_type = 'plan_cycle'   then now() - interval '14 days'
    when entry_type = 'TOPUP'                                   then now() - interval '6 days'
    when entry_type = 'GRANT'  and action_type = 'referral_bonus' then now() - interval '2 days'
    else now() - make_interval(days => (28 - (seq % 28))::int,
                               hours => ((seq * 7) % 11)::int,
                               mins  => ((seq * 13) % 60)::int)
  end;

alter table credit_ledger enable trigger user;

-- The balances row carries its own updated_at; keep it honest.
update credit_balances set updated_at = now() where true;

select entry_type,
       count(*) as n,
       min(created_at)::date as first,
       max(created_at)::date as last
from credit_ledger group by entry_type order by 1;
