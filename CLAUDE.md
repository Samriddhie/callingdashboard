# Calling Dashboard — architecture rules (do not violate)

## Schemas
- Layer 2 lives in the `calling` schema. `public` is READ ONLY.
- Never create, alter or drop anything in `public`. That includes adding a
  column to an existing table — put such changes in a separate migration file
  marked DO NOT RUN WITHOUT APPROVAL.

## Source of truth
- `public.customer_segments` (Siddharth's existing table) is READ-ONLY.
  Never write to it. Its `identity_key` column is the join key for the entire
  system. It has NO primary key and NO unique constraint, only a btree index,
  so no foreign key to it is possible from `calling.*`.
- Shopify is the source of truth for ORDERS. Order data flows Shopify ->
  Siddharth's tables. We NEVER create our own orders table and never duplicate
  order data.
- Order counts and analytics are READ from `public.order_analytics`.

## Tables we own (write access) — all in the `calling` schema
- `calling.app_user` — who is at the keyboard.
- `calling.call_log` — one row PER PHONE CALL (not per customer). Named
  `call_log` because `public.data_sources.call_log_id` refers to it.
- `calling.call_note` — the raw note from a call, kept as evidence.
- `calling.customer_info_entry` — append-only history, one row per fact.
  Every entry must carry a source reference.
- `calling.customer_additional_info` — current values, one row per customer.
  Enrichment we learn that Shopify does not have.
- `calling.cat_profile` — per-cat data lives here, NOT in `public.cat_names`.
  `cat_names` has no age, no breed and no per-cat food response, and we may
  not alter it.
- `calling.follow_up_ticket` — callbacks.

## Hard constraints
- NOTHING may persist in browser localStorage or sessionStorage. All state goes to Postgres.
- One customer can have multiple Shopify IDs and multiple phone numbers.
  Call logs must record WHICH phone number was actually dialled (`call_log.phone_norm`).
- Join on `identity_key`, never on a phone number. The one exception is
  `public.client_identity`, which has no `identity_key` and can only be reached
  by phone or `customer_id`.
- Ask before inventing any new table. Propose it first with a reason.
