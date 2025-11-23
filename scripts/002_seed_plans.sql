-- Seed basic plans
insert into public.plans (code, name, price_usd, description, sort_order, features)
values
  ('free', 'Free', 0, '2 signals/day, limited AI', 1, '{"signals_per_day":2,"ai_questions_per_day":3}'),
  ('starter', 'Starter', 19, '5–8 signals/day + full journal', 2, '{"signals_per_day":8,"ai_questions_per_day":20}'),
  ('pro', 'Pro', 49, 'High-conviction setups + advanced stats', 3, '{"signals_per_day":12,"ai_questions_per_day":"unlimited"}'),
  ('elite', 'Elite', 99, 'Elite features & weekly AI review', 4, '{"signals_per_day":"unlimited"}')
on conflict (code) do update
set name = excluded.name,
    price_usd = excluded.price_usd,
    description = excluded.description,
    sort_order = excluded.sort_order,
    features = excluded.features;
