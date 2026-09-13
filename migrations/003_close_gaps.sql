-- 003_close_gaps.sql
--
-- Closes the gaps listed under "NOWHERE TO GO" in SCHEMA_MAP.md: fields that
-- are captured on a live screen today but had no column to land in after 001.
--
-- NOT RUN YET.
--
-- Nothing here touches the public schema. Every change is inside `calling`.
--
-- On calling.cat_profile and CLAUDE.md's "ask before inventing any new table":
--   public.cat_names is per-cat but holds only cat_name, name_known,
--   name_source, health_notes and preferred_sku. It has no age, no breed and
--   no per-cat food response, and we may not alter public. Those four fields
--   are filled in during live calls, so the alternative to this table is
--   losing them. Approved on that basis; the reason is recorded here so the
--   next person does not have to reconstruct it.
--
-- Idempotency note: `if not exists` is used throughout, matching 001. Drop it
-- if you would rather this file fail loudly on a second run.

begin;


-- ---------------------------------------------------------------------------
-- calling.call_log — the finer-grained call timeline
--
-- 001 recorded initiated_at, connected_at and ended_at. Those three cannot
-- tell "shown but never dialled" from "dialled but never rang", and they lose
-- the wrap-up period entirely. Together with the existing columns these five
-- timestamps make the call's state derivable, which is what the old
-- calls[].status field was doing by hand.
-- ---------------------------------------------------------------------------
alter table calling.call_log
  add column if not exists revealed_at   timestamptz,
  add column if not exists ringing_at    timestamptz,
  add column if not exists wrapped_up_at timestamptz;

comment on column calling.call_log.revealed_at is
  'When the phone number was shown on screen. Earlier than initiated_at, and set even if the agent never actually dialled.';
comment on column calling.call_log.ringing_at is
  'When the phone started ringing, which is after the agent dialled but before anyone answered.';
comment on column calling.call_log.wrapped_up_at is
  'When the agent finished writing the call up. This is later than ended_at: the call is over, but the note and the filing are not.';


-- ---------------------------------------------------------------------------
-- calling.follow_up_ticket — why the callback exists
-- ---------------------------------------------------------------------------
alter table calling.follow_up_ticket
  add column if not exists notes text;

comment on column calling.follow_up_ticket.notes is
  'Why this callback was booked and what to cover, written when the reminder was created.';


-- ---------------------------------------------------------------------------
-- calling.customer_additional_info — standing status and subscription
--
-- do_not_call already covers the do-not-call case. `status` covers every other
-- reason a customer stops being callable, which do_not_call cannot express.
-- ---------------------------------------------------------------------------
alter table calling.customer_additional_info
  add column if not exists status text not null default 'active'
    check (status in ('active', 'lost', 'paused')),
  add column if not exists subscription_interest text,
  add column if not exists subscription_status   text;

comment on column calling.customer_additional_info.status is
  'Where this customer stands: active, lost, or paused. Separate from do_not_call, which is specifically about them asking us not to ring.';
comment on column calling.customer_additional_info.subscription_interest is
  'What they said about wanting a regular repeat order.';
comment on column calling.customer_additional_info.subscription_status is
  'Where a subscription has actually got to, for example confirmed or cancelled.';


-- ---------------------------------------------------------------------------
-- calling.cat_profile — one row per cat
--
-- The per-cat fields public.cat_names has no room for. Where a cat also exists
-- in public.cat_names, cat_name_id points at it; where it does not, this row
-- stands on its own. There is no foreign key, because public is read-only and
-- we do not put constraints on a schema we do not control.
-- ---------------------------------------------------------------------------
create table if not exists calling.cat_profile (
  id                 uuid        primary key default gen_random_uuid(),
  identity_key       text        not null,
  cat_name_id        uuid,
  name               text,
  age                text,
  breed              text,
  truehunt_response  text,
  cat_comment        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists cat_profile_identity_idx
  on calling.cat_profile (identity_key);

comment on table  calling.cat_profile is
  'One row per cat, holding what public.cat_names has no column for: age, breed, and how that particular cat took to the food. Not a replacement for cat_names.';
comment on column calling.cat_profile.identity_key is
  'Which customer this cat belongs to.';
comment on column calling.cat_profile.cat_name_id is
  'The matching row in public.cat_names, when there is one. No foreign key: public is read-only.';
comment on column calling.cat_profile.name is
  'The cat''s name as given to us. Held here as well so a cat that has no row in public.cat_names is still nameable.';
comment on column calling.cat_profile.age is
  'The cat''s age, in whatever form the customer gave it — "about 2", "8 months". Free text on purpose.';
comment on column calling.cat_profile.breed is
  'The cat''s breed, as the customer describes it.';
comment on column calling.cat_profile.truehunt_response is
  'Whether THIS cat liked the food. A household with three cats gives three different answers, which is why it lives per cat and not on the customer.';
comment on column calling.cat_profile.cat_comment is
  'Anything else said about this particular cat and the food.';
comment on column calling.cat_profile.updated_at is
  'When this cat''s details were last changed.';


commit;
