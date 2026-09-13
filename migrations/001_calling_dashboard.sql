-- 001_calling_dashboard.sql
--
-- The calling dashboard's own tables, in their own schema.
--
-- Everything the dashboard writes lives in the `calling` schema. The `public`
-- schema is read only: it is the Shopify sync and Siddharth's segment work,
-- and nothing in this file creates, alters or drops anything there.
--
-- Two things follow from that separation:
--   * `identity_key` is a plain indexed text column, never a foreign key.
--     public.customer_segments has no primary key and no id column, so there
--     is nothing to point a constraint at.
--   * `customer_info_entry.source_id` holds a public.data_sources id but has
--     no foreign key either, for the same reason — we do not add constraints
--     that would depend on a read-only schema.
--
-- The call table is named call_log because public.data_sources already has a
-- `call_log_id uuid` column waiting for it.
--
-- No orders table. Order data is read from public.order_analytics and never
-- copied here.

begin;

create schema if not exists calling;

comment on schema calling is
  'Tables the calling dashboard owns and writes to. Everything in public is read-only source data.';


-- ---------------------------------------------------------------------------
-- calling.app_user — who is at the keyboard
-- ---------------------------------------------------------------------------
create table if not exists calling.app_user (
  id          uuid        primary key default gen_random_uuid(),
  google_sub  text        unique,
  email       text        not null unique,
  name        text,
  role        text        not null default 'agent',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

comment on table  calling.app_user is
  'People who use the calling dashboard. One row per employee.';
comment on column calling.app_user.google_sub is
  'The permanent id Google gives this person at sign-in. Stays the same even if their name or email changes.';
comment on column calling.app_user.email is
  'Work email address, taken from their Google sign-in.';
comment on column calling.app_user.role is
  'What this person is allowed to do, for example agent or manager.';
comment on column calling.app_user.is_active is
  'False when someone has left. Their past calls stay, but they can no longer sign in.';


-- ---------------------------------------------------------------------------
-- calling.call_log — ONE ROW PER PHONE CALL (not per customer)
--
-- The row is created the moment the agent dials and updated at wrap-up, so a
-- call that is abandoned halfway still leaves a record that it happened.
-- ---------------------------------------------------------------------------
create table if not exists calling.call_log (
  id                    uuid        primary key default gen_random_uuid(),
  identity_key          text        not null,
  phone_norm            text        not null,
  shopify_customer_id   bigint,
  initiated_by          uuid        references calling.app_user (id),
  initiated_at          timestamptz not null default now(),
  connected_at          timestamptz,
  ended_at              timestamptz,
  duration_sec          integer,
  outcome               text        check (outcome in ('connected', 'not_connected')),
  not_connected_reason  text,
  disposition           text        check (disposition in ('interested', 'ordered', 'callback', 'do_not_call')),
  order_number          text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists call_log_identity_key_idx on calling.call_log (identity_key);
create index if not exists call_log_phone_norm_idx   on calling.call_log (phone_norm);
create index if not exists call_log_initiated_at_idx on calling.call_log (initiated_at desc);

comment on table  calling.call_log is
  'One row for every phone call placed from the dashboard. Named call_log because public.data_sources.call_log_id points at it.';
comment on column calling.call_log.id is
  'Id for this call. Must be a uuid: public.data_sources.call_log_id refers to it.';
comment on column calling.call_log.identity_key is
  'Which customer was called. The key the whole system joins on. Not a foreign key: public.customer_segments has no primary key to point at.';
comment on column calling.call_log.phone_norm is
  'The number that was actually dialled, normalised with public.norm_phone(). A customer can have several numbers, so we record the one used.';
comment on column calling.call_log.shopify_customer_id is
  'The Shopify customer id, kept so we can link straight to them in Shopify. Empty for anyone not in Shopify.';
comment on column calling.call_log.initiated_by is
  'Which employee made this call.';
comment on column calling.call_log.initiated_at is
  'When the agent clicked Call. The row is created at this moment, not when the call is saved.';
comment on column calling.call_log.connected_at is
  'When the customer actually picked up. Empty if they never did.';
comment on column calling.call_log.duration_sec is
  'How long the customer was on the phone, in seconds.';
comment on column calling.call_log.outcome is
  'Whether the call connected at all: connected or not_connected.';
comment on column calling.call_log.not_connected_reason is
  'If nobody picked up, why: for example no answer, busy, or wrong number.';
comment on column calling.call_log.disposition is
  'How the call ended: interested, ordered, callback, or do_not_call.';
comment on column calling.call_log.order_number is
  'If they ordered on the call, the order number they gave. The order itself stays in public.order_analytics.';
comment on column calling.call_log.updated_at is
  'When this row was last changed, normally at wrap-up.';


-- ---------------------------------------------------------------------------
-- calling.call_note — the raw note, kept as evidence
--
-- The note is the source record. Anything important in it is also pulled out
-- into customer_info_entry, because people do not read whole notes.
-- ---------------------------------------------------------------------------
create table if not exists calling.call_note (
  id            uuid        primary key default gen_random_uuid(),
  call_id       uuid        references calling.call_log (id) on delete cascade,
  identity_key  text        not null,
  raw_text      text        not null,
  author_id     uuid        references calling.app_user (id),
  created_at    timestamptz not null default now()
);

create index if not exists call_note_identity_key_idx on calling.call_note (identity_key);

comment on table  calling.call_note is
  'What the agent typed during a call, word for word. The evidence behind every structured fact later extracted from it.';
comment on column calling.call_note.call_id is
  'Which call this note was written on. Deleting the call deletes the note with it.';
comment on column calling.call_note.identity_key is
  'Which customer the note is about. Repeated here so notes can be read without joining through the call.';
comment on column calling.call_note.raw_text is
  'The note exactly as typed. Never edited or summarised.';
comment on column calling.call_note.author_id is
  'Which employee wrote it.';


-- ---------------------------------------------------------------------------
-- calling.customer_info_entry — APPEND ONLY, one row per fact learned
--
-- Never updated, never deleted. Keeping previous_value beside value means the
-- history reads out of this one table; there is no separate history table.
-- The same table serves facts from call notes and from Kwik Engage messages.
-- ---------------------------------------------------------------------------
create table if not exists calling.customer_info_entry (
  id              uuid        primary key default gen_random_uuid(),
  identity_key    text        not null,
  field_name      text        not null,
  value           text,
  previous_value  text,
  source_id       uuid,
  call_id         uuid        references calling.call_log (id),
  occurred_at     timestamptz,
  author_id       uuid        references calling.app_user (id),
  approved        boolean     not null default false,
  approved_by     uuid        references calling.app_user (id),
  approved_at     timestamptz
);

create index if not exists customer_info_entry_identity_key_idx on calling.customer_info_entry (identity_key);
create index if not exists customer_info_entry_identity_field_idx on calling.customer_info_entry (identity_key, field_name);

comment on table  calling.customer_info_entry is
  'Every fact we have ever learned about a customer, one row each, added and never changed. This is the history: nothing is overwritten.';
comment on column calling.customer_info_entry.identity_key is
  'Which customer this fact is about.';
comment on column calling.customer_info_entry.field_name is
  'Which piece of information this is, for example feeding_split or benefits_noticed.';
comment on column calling.customer_info_entry.value is
  'What we learned. Empty means the previous answer was cleared.';
comment on column calling.customer_info_entry.previous_value is
  'What this field said before this entry, so the change reads without a lookup.';
comment on column calling.customer_info_entry.source_id is
  'Where this came from: a row in public.data_sources, which points at the WhatsApp message, form or call. No foreign key, because public is read-only.';
comment on column calling.customer_info_entry.call_id is
  'The call this came from, when it came from a call. Empty for anything learned another way.';
comment on column calling.customer_info_entry.occurred_at is
  'When the customer actually said it, which can be earlier than when it was typed in.';
comment on column calling.customer_info_entry.author_id is
  'Which employee recorded it.';
comment on column calling.customer_info_entry.approved is
  'Whether a person has checked this and agreed it is right. Nothing reaches customer_additional_info until this is true.';
comment on column calling.customer_info_entry.approved_by is
  'Which employee approved it.';


-- ---------------------------------------------------------------------------
-- calling.customer_additional_info — CURRENT VALUES, one row per customer
--
-- A read cache. Derived entirely from the approved entries above, so it can be
-- thrown away and rebuilt at any time. The entry log is the source of truth.
-- ---------------------------------------------------------------------------
create table if not exists calling.customer_additional_info (
  identity_key         text        primary key,
  packets_per_day      numeric,
  feeding_split        text,
  dry_brands           text[],
  wet_brands           text[],
  buys_from            text[],
  overall_experience   text,
  benefits_noticed     text,
  cat_behaviour_notes  text,
  family_info          text,
  photo_url            text,
  do_not_call          boolean     not null default false,
  updated_at           timestamptz not null default now()
);

comment on table  calling.customer_additional_info is
  'The current answer for each thing we know about a customer that Shopify does not hold. Derived from customer_info_entry, which is the source of truth.';
comment on column calling.customer_additional_info.identity_key is
  'Which customer this row describes. One row per customer.';
comment on column calling.customer_additional_info.packets_per_day is
  'How many packets the household feeds in a day. Halves are normal, so this is a decimal.';
comment on column calling.customer_additional_info.feeding_split is
  'How they feed, in their own words, for example dry in the morning and wet at night.';
comment on column calling.customer_additional_info.dry_brands is
  'Other dry food brands they buy.';
comment on column calling.customer_additional_info.wet_brands is
  'Other wet food brands they buy.';
comment on column calling.customer_additional_info.buys_from is
  'Where they shop for cat food, for example a local shop or an online store.';
comment on column calling.customer_additional_info.overall_experience is
  'What the customer said about TrueHunt: packaging, smell, texture, ingredients, brand, pricing.';
comment on column calling.customer_additional_info.benefits_noticed is
  'Any improvement they have noticed since feeding TrueHunt, for example a shinier coat.';
comment on column calling.customer_additional_info.cat_behaviour_notes is
  'Anything about how the cats behave, or a disease or habit worth knowing before the next call.';
comment on column calling.customer_additional_info.family_info is
  'Useful background about the customer and their household.';
comment on column calling.customer_additional_info.photo_url is
  'Link to their photo. The image itself is stored outside the database.';
comment on column calling.customer_additional_info.do_not_call is
  'True when the customer has asked not to be contacted. They stay on file but never appear in a calling queue again.';
comment on column calling.customer_additional_info.updated_at is
  'When this summary was last rebuilt from the entry log.';


-- ---------------------------------------------------------------------------
-- calling.follow_up_ticket — callbacks
-- ---------------------------------------------------------------------------
create table if not exists calling.follow_up_ticket (
  id             uuid        primary key default gen_random_uuid(),
  identity_key   text        not null,
  call_id        uuid        references calling.call_log (id),
  scheduled_for  timestamptz not null,
  status         text        not null default 'open' check (status in ('open', 'done', 'cancelled')),
  attempt_count  integer     not null default 0,
  assigned_to    uuid        references calling.app_user (id),
  created_at     timestamptz not null default now()
);

create index if not exists follow_up_ticket_open_scheduled_idx
  on calling.follow_up_ticket (scheduled_for)
  where status = 'open';

comment on table  calling.follow_up_ticket is
  'A reminder to call someone back, either because they asked for a callback or because the call was marked interested.';
comment on column calling.follow_up_ticket.identity_key is
  'Which customer to call back.';
comment on column calling.follow_up_ticket.call_id is
  'The call that created this reminder.';
comment on column calling.follow_up_ticket.scheduled_for is
  'When to call them.';
comment on column calling.follow_up_ticket.status is
  'Whether it is still waiting, has been done, or was cancelled.';
comment on column calling.follow_up_ticket.attempt_count is
  'How many times we have already tried to reach them for this reminder.';
comment on column calling.follow_up_ticket.assigned_to is
  'Which employee should make the call.';

commit;
