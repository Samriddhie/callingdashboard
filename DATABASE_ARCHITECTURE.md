# Calling Dashboard — Database Architecture

Verified against `truehunt_crm` on 3 Sep 2026, after migrations 001 and 003.
Every table and column below was read out of the live database, not from a
previous version of this document.

## The key

`identity_key` (text) is the canonical customer key. It appears and is indexed
in `public.customer_segments` and `public.order_analytics`.

**Verified fact — no foreign key is possible on it.**
`customer_segments` holds 3,766 rows with 3,766 distinct `identity_key` values
and no nulls, so the key is unique *in practice*. But the table has **no primary
key and no UNIQUE constraint** — only a plain btree index
(`customer_segments_identity_key_idx`). PostgreSQL will not accept a foreign key
against a column with no unique constraint, so every `identity_key` column in
`calling.*` is a plain indexed text column. Uniqueness is convention, and
nothing in the database enforces it.

**Also verified:** `identity_key` is the normalised phone number in 3,724 of
3,766 rows (98.9%); only 42 differ. Rule 4 below still stands — join on
`identity_key` — but be aware the two are nearly the same value, so a phone
join that "works" is not evidence that the key is being used correctly.

All phone numbers are normalised by the existing function `public.norm_phone()`.

## Layer 1 — `public` schema, READ ONLY (never write, never alter)

| Table | Used for |
|---|---|
| customers | Shopify customer master; `customers.id` (bigint) = Shopify id for deep links |
| client_identity | Browser/session identity. PK `client_id`. **Has no `identity_key`** — see the note below |
| customer_segments | segment, orders, max_order, recency, `phone_norm`, `first_order_at`, `last_order_at` |
| segment_definitions | segment rules (`sr_no` PK) |
| order_analytics | ALL order data (`order_id` PK, `order_at`, indexed on `identity_key`) |
| orders, order_items | Shopify order detail, fulfilment status, tracking |
| kwik_messages, kwik_message_logs, abandoned_carts | GoKwik engagement |
| data_sources | source registry (uuid PK): `whatsapp_msg_id`, `form_submission_id`, `call_log_id` |
| cat_names, cat_count | existing per-cat tables, keyed on `phone`, `source_id` wired |

**`client_identity` cannot be joined on `identity_key`** — it does not have that
column. Its only routes in are `phone` and `customer_id`. Joining
`customer_segments` to it by normalised phone matches **1,266 of 3,766
customers (34%)**. Its 2,917 rows are mostly anonymous web sessions: 1,586 carry
a phone, 1,426 carry a `customer_id`.

## Layer 2 — `calling` schema, TABLES WE OWN

Seven tables. All live in the `calling` schema; nothing we own is in `public`.

### calling.app_user
`id` uuid PK gen_random_uuid | `google_sub` text UNIQUE | `email` text NOT NULL UNIQUE |
`name` text | `role` text NOT NULL default 'agent' | `is_active` boolean NOT NULL default true |
`created_at` timestamptz NOT NULL default now()

Replaces localStorage `users[]` and the `calldesk.session` key.

### calling.call_log — one row PER CALL
`id` uuid PK gen_random_uuid — must be uuid: `public.data_sources.call_log_id` refers to it
`identity_key` text NOT NULL | `phone_norm` text NOT NULL — the number actually dialled
`shopify_customer_id` bigint | `initiated_by` uuid → app_user
`revealed_at` timestamptz — number shown on screen *(003)*
`initiated_at` timestamptz NOT NULL default now() — row INSERTED here, on dial
`ringing_at` timestamptz *(003)* | `connected_at` timestamptz | `ended_at` timestamptz
`wrapped_up_at` timestamptz — agent finished writing up; later than `ended_at` *(003)*
`duration_sec` integer
`outcome` text CHECK (connected | not_connected)
`not_connected_reason` text
`disposition` text CHECK (interested | ordered | callback | do_not_call)
`order_number` text | `created_at`, `updated_at` timestamptz NOT NULL default now()

Indexes: `identity_key`, `phone_norm`, `initiated_at DESC`.
Row is INSERTED on dial and UPDATED at wrap-up. Never inserted only at save.
The six timestamps make the call's state derivable; there is no status column.

### calling.call_note — the raw note, kept as evidence
`id` uuid PK | `call_id` uuid → call_log ON DELETE CASCADE | `identity_key` text NOT NULL |
`raw_text` text NOT NULL | `author_id` uuid → app_user | `created_at` timestamptz NOT NULL

Index: `identity_key`.

### calling.customer_info_entry — append-only history, one row per fact
`id` uuid PK | `identity_key` text NOT NULL | `field_name` text NOT NULL |
`value` text | `previous_value` text — gives live history, no separate history table |
`source_id` uuid — holds a `public.data_sources.id`, no FK (public is read-only) |
`call_id` uuid → call_log | `occurred_at` timestamptz | `author_id` uuid → app_user |
`approved` boolean NOT NULL default false | `approved_by` uuid → app_user | `approved_at` timestamptz

Indexes: `identity_key`, and `(identity_key, field_name)`.
Never updated, never deleted. Serves call notes, Kwik Engage parsing, and
free-text customer notes (`field_name = 'customer_note'`).

### calling.customer_additional_info — current values, one row per customer
`identity_key` text PK | `packets_per_day` numeric | `feeding_split` text |
`dry_brands` text[] | `wet_brands` text[] | `buys_from` text[] |
`overall_experience` text | `benefits_noticed` text | `cat_behaviour_notes` text |
`family_info` text | `photo_url` text | `do_not_call` boolean NOT NULL default false |
`status` text NOT NULL default 'active' CHECK (active | lost | paused) *(003)* |
`subscription_interest` text *(003)* | `subscription_status` text *(003)* |
`updated_at` timestamptz NOT NULL default now()

Derived from `customer_info_entry`. The entry log is the truth; this is the read cache.

### calling.cat_profile — one row PER CAT *(003)*
`id` uuid PK gen_random_uuid | `identity_key` text NOT NULL |
`cat_name_id` uuid — the matching `public.cat_names.id`, no FK |
`name` text | `age` text | `breed` text |
`truehunt_response` text — did THIS cat like the food |
`cat_comment` text | `created_at`, `updated_at` timestamptz NOT NULL default now()

Index: `identity_key`.
Exists because `public.cat_names` has no age, no breed and no per-cat food
response, and we may not alter `public`. Not a replacement for `cat_names`.

### calling.follow_up_ticket — callbacks
`id` uuid PK | `identity_key` text NOT NULL | `call_id` uuid → call_log |
`scheduled_for` timestamptz NOT NULL |
`status` text NOT NULL default 'open' CHECK (open | done | cancelled) |
`attempt_count` integer NOT NULL default 0 | `assigned_to` uuid → app_user |
`notes` text *(003)* | `created_at` timestamptz NOT NULL

Partial index: `scheduled_for` WHERE `status = 'open'`.

## Flow

```
Shopify -> public.customers / order_analytics / customer_segments   [READ ONLY]
                          | identity_key
   calling.call_log  +  call_note  +  Kwik Engage messages
                          |
              parse/extract -> agent approves
                          |
       calling.customer_info_entry (append-only, source_id, approved)
                          |
   calling.customer_additional_info + calling.cat_profile   (current values)
```

## Rules

1. Nothing enters `customer_additional_info` except via an approved `customer_info_entry`.
2. Every `customer_info_entry` carries a `source_id`.
3. No orders table in Layer 2. Ever.
4. Join on `identity_key`, never on a phone number — except `client_identity`,
   which has no `identity_key` and can only be reached by phone.

## Open decisions

Only what is genuinely unresolved, with who decides it.

| # | Question | Decides |
|---|---|---|
| 1 | Add `identity_key` to `public.cat_names` and `public.cat_count`? Both are keyed on `phone`, which breaks for a customer with several numbers. `migrations/002_pending_approval.sql` is written and unrun. Both tables are still empty, so it is free today. | **Siddharth** |
| 2 | Where do cat photos go? `customer_additional_info.photo_url` exists but has nothing to point at. S3 recommended over `bytea`. | **Samriddhi / Manish** |
| 3 | Can a `UNIQUE` constraint be added to `customer_segments.identity_key`? Without it no `calling.*` table can have a foreign key to a customer, and a duplicate from a future sync would silently fan out every join. | **Siddharth** |
| 4 | Is there a real signup date anywhere? `client_identity.first_seen_at` covers only 34% of customers and predates the first order in only 81% of those — it is a session first-seen, not a signup. Without one, "days to first order" cannot be computed honestly. | **Siddharth** |
| 5 | Should the app be able to create a customer? Shopify owns the master, so the New customer screen has no destination and currently cannot be migrated. | **Manish** |
| 6 | Five per-cat fields still have no column: `foodAmountComment`, `trueHuntPreference`, `generalFoodPreference`, `palatability`, `eatingHabits`. Add to `cat_profile`, or drop? | **Samriddhi** |

### Resolved since the last version

- ~~Where do Layer 2 tables live?~~ The `calling` schema in `truehunt_crm`. Applied 3 Sep 2026.
- ~~12 retired columns~~ Not migrated. See SCHEMA_MAP.md, "DROPPED ON PURPOSE".
- ~~Cat age, breed, per-cat food response~~ `calling.cat_profile`, migration 003.
