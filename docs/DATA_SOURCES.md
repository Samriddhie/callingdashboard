# How the CRM tables are generated, and what the calling tables look like

Verified against `truehunt_crm` on 3 Sep 2026.

---

## 1. The two headline findings

### The CRM data is 14 days stale and nothing refreshes it

Every row in `order_analytics` carries the **same** `updated_at`:

```
first_update | last_update                    | distinct_days | distinct_timestamps
2026-08-20   | 2026-08-20 16:47:57.766+05:30  | 1             | 1
```

All 6,389 rows written in one batch, once. `orders` was last touched
2026-08-20 16:44, and the newest order anywhere in `customer_segments` is
2026-08-20 16:07.

On this machine there is **no refresh mechanism at all**: no `pg_cron`
extension, no triggers on any of the three tables, no crontab entry, and no
sync script on disk. The database was bulk-loaded once and has sat still since.

**Why this matters for calling:** the priority queue ranks on "days since last
order" against each customer's own cadence. With the data frozen on 20 August,
every customer looks 14 days more overdue than they are, and anyone who has
ordered since is invisible. Reorder-due, segment, and recency are all wrong by
the same 14 days — and the gap grows daily.

The sync must live somewhere else (Siddharth's machine, or the EC2 box). Finding
it and putting it on a schedule is a prerequisite for trusting the queue.

### Multiple phone numbers affect 4 customers, not many

Counting distinct numbers per customer across `customer_segments.phone_norm`,
`customers.phone` and `orders.phone`:

```
customers | with_multiple_phones | most_phones
3762      | 4                    | 2
```

**4 customers out of 3,762 (0.1%)** have a second number, and none has more
than two. Multiple Shopify accounts are similarly rare: of the 1,119
identity_keys that match a Shopify customer at all, **29 have two accounts**,
and none has three.

The requirement is architecturally right — one person, several numbers — but
today it is a 4-customer problem. Worth knowing before building a phone-picker
step into every call.

---

## 2. How `order_analytics` is generated

**It is a table, not a view or materialised view** — so something writes it;
nothing computes it on read.

Row counts match `orders` exactly: **6,389 = 6,389**. So it is a 1:1 copy at
order level, confirming the description: *a copy of the orders table with line
items removed, plus columns for recipe-wise packets and inventory*.

Its 44 columns fall into four groups:

| Group | Columns |
|---|---|
| **Identity / keys** | `order_id` (PK), `order_name`, `customer_id`, `identity_key`, `phone_norm` |
| **Timing & cohort** | `order_at`, `order_month`, `acquisition_cohort`, `updated_at` |
| **Purchase classification** | `category`, `is_purchase`, `counts_revenue`, `repeat_eligible`, `purchase_seq`, `is_first_purchase`, `is_repeat_purchase`, `lifetime_purchases`, `customer_is_new`, `customer_is_repeat` |
| **Revenue** | `gross_revenue`, `net_revenue`, `gm`, `payment_gateway` |
| **Recipe-wise packets (Unieco)** | `packets_mackerel_tuna`, `packets_chicken_egg`, `packets_chicken_tuna`, `total_packets` |
| **Inventory / packaging** | `wb_small`, `wb_big`, `brown_box_size`, `brown_box_qty`, `poly_size`, `poly_qty` |
| **Cost of goods** | `cogs_packet`, `cogs_logistics`, `cogs_sticker`, `cogs_labour`, `cogs_brochure`, `cogs_white_box`, `cogs_round_sticker`, `cogs_total` |
| **Fulfilment cost** | `ff_brown_box`, `ff_polythene`, `ff_tape`, `ff_delivery`, `fulfillment_total` |

Line items are indeed gone — they stay in `public.order_items`, which is a
separate table.

**Still unknown:** the code that writes it. It is not in this repo and not on
this machine. → **Siddharth**

## 3. How `customer_segments` is generated

Also a **table**, not a view. 3,766 rows, one per customer.

| Column | What it is |
|---|---|
| `customer_key` | integer, **unique** (3,766 distinct, no nulls, range 2–3802) |
| `identity_key` | text, **unique** (3,766 distinct, no nulls) — the canonical key |
| `phone_norm` | one normalised phone per customer |
| `customer_name` | display name |
| `sr_no` | the segment number — only **9 distinct values**, joining to `segment_definitions.sr_no` |
| `segment` | segment name, e.g. `VIP · Cooling` |
| `orders`, `max_order`, `recency_days` | rollups from order history |
| `first_order_at`, `last_order_at` | order date bounds |

**On `customer_segment_id`:** there is no column of that name. The closest
thing is **`customer_key`** — a unique integer that would work as a surrogate
id. But it appears in **no other table in the database**, so it is a local
surrogate, not a system-wide join key. Everything else joins on `identity_key`.
Using `customer_key` as the system id would mean adding it to
`order_analytics` and everywhere else first. → **Siddharth**

Neither `customer_key` nor `identity_key` has a PRIMARY KEY or UNIQUE
constraint — both are unique in practice only. `identity_key` has a btree
index; that is what makes a foreign key impossible.

**Still unknown:** the segmentation code that assigns `segment` and `sr_no`.
Not in this repo. → **Siddharth**

## 4. Structure of the call table — `calling.call_log`

One row per call, created when Call is clicked and updated at wrap-up.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | uuid because `public.data_sources.call_log_id` refers to it |
| `identity_key` | text NOT NULL | which customer. Indexed. No FK possible |
| `phone_norm` | text NOT NULL | **the number actually dialled**. Indexed |
| `shopify_customer_id` | bigint | for the Shopify deep link |
| `initiated_by` | uuid → `app_user` | who called |
| `revealed_at` | timestamptz | number shown on screen |
| `initiated_at` | timestamptz NOT NULL | **row is INSERTED here**. Indexed DESC |
| `ringing_at` | timestamptz | dialled, not yet answered |
| `connected_at` | timestamptz | they picked up |
| `ended_at` | timestamptz | call over |
| `wrapped_up_at` | timestamptz | agent finished writing up |
| `duration_sec` | integer | |
| `outcome` | text CHECK | `connected` \| `not_connected` |
| `not_connected_reason` | text | |
| `disposition` | text CHECK | `interested` \| `ordered` \| `callback` \| `do_not_call` |
| `order_number` | text | the number only; the order lives in `order_analytics` |
| `created_at`, `updated_at` | timestamptz NOT NULL | |

The six timestamps make the call's state derivable, so there is no status
column. `revealed_at` set with no `initiated_at` means the number was shown but
never dialled.

## 5. Structure of how note content is stored against individual fields

The note itself and the facts pulled out of it are **two different tables**.

**`calling.call_note`** — the note verbatim, kept as evidence:

| Column | Type |
|---|---|
| `id` | uuid PK |
| `call_id` | uuid → `call_log` ON DELETE CASCADE |
| `identity_key` | text NOT NULL, indexed |
| `raw_text` | text NOT NULL |
| `author_id` | uuid → `app_user` |
| `created_at` | timestamptz NOT NULL |

**`calling.customer_info_entry`** — one row per fact extracted from it,
append-only:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `identity_key` | text NOT NULL | indexed |
| `field_name` | text NOT NULL | **which field this fact belongs to** — e.g. `feeding_split`, `benefits_noticed`, `customer_note` |
| `value` | text | what was learned |
| `previous_value` | text | what it said before — the history reads out of this one table |
| `source_id` | uuid | a `public.data_sources` id: call, WhatsApp message, or form |
| `call_id` | uuid → `call_log` | which call it came from |
| `occurred_at` | timestamptz | when the customer said it |
| `author_id` | uuid → `app_user` | who recorded it |
| `approved`, `approved_by`, `approved_at` | boolean / uuid / timestamptz | the agent's confirmation gate |

Indexed on `identity_key` and on `(identity_key, field_name)` — the second is
what makes "show me every answer this customer has ever given for
`feeding_split`" fast.

**The flow:** one note → many entries.

```
call_log (1) ──< call_note (1 raw note)
                     │  parse / extract
                     ▼
        customer_info_entry (N rows, one per field_name)
                     │  once approved = true
                     ▼
   customer_additional_info  /  cat_profile   (current value per field)
```

`customer_additional_info` is a read cache and can be rebuilt from the entry
log at any time. Nothing lands in it except through an approved entry.

**Blocker:** `public.data_sources` is **empty — 0 rows**, and no `source_type`
vocabulary is defined. Rule 2 says every entry carries a `source_id`, so the
first entry cannot be written until that registry is populated. It is a
read-only table, so we cannot populate it. → **Siddharth**
