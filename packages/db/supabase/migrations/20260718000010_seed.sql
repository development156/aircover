-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 10 · reference-data seed (idempotent)
-- Plans mirror PLAN_CATALOG in @sahoda/shared (PRD §7.1). The six Alpha tours are
-- seeded with minimal placeholder definitions; wt-guide replaces them (hot-updatable).
-- ─────────────────────────────────────────────────────────────────────────────

insert into plans (id, name, monthly_credits, price_inr, price_usd, limits) values
  ('free', 'Free', 100, 0, 0, '{"channels":2,"sites":0,"seats":1,"loopLevel":1,"twinSize":0}'::jsonb),
  ('starter', 'Starter', 1500, 499, 12, '{"channels":4,"sites":1,"seats":1,"loopLevel":2,"twinSize":25}'::jsonb),
  ('growth', 'Growth', 5000, 1499, 29, '{"channels":8,"sites":3,"seats":3,"loopLevel":3,"twinSize":100}'::jsonb),
  ('agency', 'Agency', 15000, 3999, 79, '{"channels":8,"sites":10,"seats":10,"loopLevel":3,"twinSize":100}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  monthly_credits = excluded.monthly_credits,
  price_inr = excluded.price_inr,
  price_usd = excluded.price_usd,
  limits = excluded.limits;

insert into guide_tours (slug, locale, version, definition, active) values
  ('onboarding.first_tour', 'en', 1,
   '{"id":"onboarding.first_tour","version":1,"locale":"en","trigger":{"type":"first_visit","route":"/onboarding"},"steps":[{"anchor":"onboarding.start","say":"Welcome — let''s teach me your brand.","action":"next"}],"difm_allowed":false,"max_steps_visible":8}'::jsonb,
   true),
  ('posts.first_tour', 'en', 1,
   '{"id":"posts.first_tour","version":1,"locale":"en","trigger":{"type":"first_visit","route":"/posts"},"steps":[{"anchor":"posts.new_button","say":"Create your first post here.","action":"click","spotlight":true}],"difm_allowed":true,"max_steps_visible":8}'::jsonb,
   true),
  ('approve.first_tour', 'en', 1,
   '{"id":"approve.first_tour","version":1,"locale":"en","trigger":{"type":"first_visit","route":"/planner"},"steps":[{"anchor":"planner.approve","say":"Approve a post to schedule it.","action":"next"}],"difm_allowed":false,"max_steps_visible":8}'::jsonb,
   true),
  ('connect.first_tour', 'en', 1,
   '{"id":"connect.first_tour","version":1,"locale":"en","trigger":{"type":"first_visit","route":"/connections"},"steps":[{"anchor":"connections.connect_x","say":"Connect a channel to publish for real.","action":"next"}],"difm_allowed":false,"max_steps_visible":8}'::jsonb,
   true),
  ('wallet.first_tour', 'en', 1,
   '{"id":"wallet.first_tour","version":1,"locale":"en","trigger":{"type":"first_visit","route":"/wallet"},"steps":[{"anchor":"wallet.balance","say":"Your credits live here — every charge shows why.","action":"next"}],"difm_allowed":false,"max_steps_visible":8}'::jsonb,
   true),
  ('site.first_tour', 'en', 1,
   '{"id":"site.first_tour","version":1,"locale":"en","trigger":{"type":"first_visit","route":"/sites"},"steps":[{"anchor":"sites.generate","say":"Describe a site and I''ll build + deploy it.","action":"next"}],"difm_allowed":false,"max_steps_visible":8}'::jsonb,
   true)
on conflict (slug, locale) do nothing;
