alter table public.customers
  add column if not exists thyroid_issues text check (thyroid_issues is null or thyroid_issues in ('si', 'no', '')),
  add column if not exists body_products text,
  add column if not exists previous_botox_or_substance text check (previous_botox_or_substance is null or previous_botox_or_substance in ('si', 'no', '')),
  add column if not exists previous_substance_details text,
  add column if not exists secondary_reactions text check (secondary_reactions is null or secondary_reactions in ('si', 'no', '')),
  add column if not exists seafood_allergy text check (seafood_allergy is null or seafood_allergy in ('si', 'no', '')),
  add column if not exists seafood_allergy_details text,
  add column if not exists healing_problems text check (healing_problems is null or healing_problems in ('si', 'no', ''));
