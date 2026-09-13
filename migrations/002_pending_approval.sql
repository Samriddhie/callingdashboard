-- 002_pending_approval.sql
--
-- ============================================================================
-- DO NOT RUN WITHOUT APPROVAL.
--
-- This file ALTERS TABLES IN THE public SCHEMA, which is read-only for us.
-- It needs Siddharth's sign-off before it goes anywhere near a database.
-- Nothing in 001 touches public; this file is separated for exactly that
-- reason. Do not fold it back into 001.
-- ============================================================================
--
-- Why it exists
--
-- public.cat_names and public.cat_count are keyed on `phone`. That breaks for
-- a customer with more than one number: the same cat can appear twice under
-- two numbers and neither row knows about the other. Every other table in the
-- design joins on identity_key, and these two are the only ones that do not.
--
-- Verified 2 Sep 2026: both tables are EMPTY (0 rows), so adding the column
-- costs nothing today and there is no backfill to run. That stops being true
-- as soon as calling starts.
--
-- Still unresolved and NOT proposed here: cat age and breed are captured on
-- screen today and have nowhere to live (see SCHEMA_MAP.md, "NOWHERE TO GO").
-- Adding them means either new columns on public.cat_names or a table of our
-- own in the calling schema, and that is a separate decision.

begin;

-- --- public.cat_names ------------------------------------------------------

alter table public.cat_names
  add column if not exists identity_key text;

comment on column public.cat_names.identity_key is
  'Which customer this cat belongs to. Added so cats follow the customer rather than a single phone number.';

create index if not exists cat_names_identity_key_idx
  on public.cat_names (identity_key);

-- --- public.cat_count ------------------------------------------------------

alter table public.cat_count
  add column if not exists identity_key text;

comment on column public.cat_count.identity_key is
  'Which customer this count belongs to. Added so the number of cats follows the customer rather than a single phone number.';

create index if not exists cat_count_identity_key_idx
  on public.cat_count (identity_key);

commit;


-- --- if these tables have gained rows before approval ----------------------
-- Both were empty when this was written, so no backfill is included above.
-- If that has changed, populate identity_key before relying on it:
--
--   update public.cat_names c
--      set identity_key = s.identity_key
--     from public.customer_segments s
--    where s.phone_norm = public.norm_phone(c.phone)
--      and c.identity_key is null;
--
-- public.cat_count.phone is that table's primary key, so it cannot simply be
-- replaced by identity_key. Changing that key is a further decision.
