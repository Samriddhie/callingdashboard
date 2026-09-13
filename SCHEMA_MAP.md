# Schema map — every audited field and where it goes

Maps every row of `DATA_AUDIT.md` onto the schema created by
`migrations/001_calling_dashboard.sql` (applied to `truehunt_crm`, 3 Sep 2026).

**LS** = localStorage `calldesk.data.v2`. **public.** = the read-only CRM schema.
**calling.** = the six tables we own.

"Read live from public.X" means we stop storing the value entirely — the screen
queries the CRM each time, so it cannot go stale.

---

## Customer list

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| LS `customers[].name` | `public.customer_segments.customer_name` | Read live; we hold no copy |
| LS `customers[].phone` | `public.customer_segments.phone_norm` | Normalised by `public.norm_phone()` |
| LS `customers[].city` | `public.customers` | Shopify owns the address |
| Cats count (computed) | `public.cat_count.count` | Needs migration 002 to key on identity |
| LS `customers[].ordersCount` | `public.customer_segments.orders` | See DROPPED ON PURPOSE |
| LS `customers[].totalSpent` | `public.order_analytics` (sum) | See DROPPED ON PURPOSE |
| Last order (computed) | `public.customer_segments.last_order_at` | See DROPPED ON PURPOSE |
| Calls count (computed) | Computed: `count(*) from calling.call_log where identity_key = ?` | |
| LS `customers[].lastCalledAt` | Computed: `max(calling.call_log.initiated_at)` | No longer stored; derived from the call log |
| Search query (React state) | Not persisted | UI state |
| CRM import (bulk) → LS | **Removed** | Nothing to import into; the list reads `public` directly |
| CSV export/import | Export only, from `calling.*` + `public.*` | The import path disappears with the local store |

## New customer

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| LS `customers[]` name, phone, email, city | **None** | Shopify owns the customer master — see NOWHERE TO GO |
| LS `customers[].signupDate` | `public.client_identity.first_seen_at` | **Partial: 1,266 of 3,766 customers (34%).** Reached only by phone join; see caveat below |
| LS `orders[]` first order number / date / amount | **None** | No orders table, ever |
| Draft form values (React state) | Not persisted | UI state |

## Customer detail — header

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| LS `customers[].name` | `public.customer_segments.customer_name` | |
| Segment (name, orders, recency) | `public.customer_segments` | Lookup moves from phone to `identity_key` |
| Segment history trail | `public.segment_history`, `public.customer_segment_history` | Both carry `identity_key` |
| LS `customers[].lastOrderDate` | `public.customer_segments.last_order_at` | |
| Cats count (computed) | `public.cat_count.count` | |
| Calls count (computed) | `calling.call_log` | |
| Shopify deep link | `calling.call_log.shopify_customer_id`, or `public.customers.id` | Needs `SHOPIFY_STORE` set to work |

## Customer detail — Customer summary

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| LS `customers[]` customer, email, city | `public.customers`, `public.client_identity` | |
| LS `customers[]` orders, total spent, last order | `public.customer_segments`, `public.order_analytics` | Snapshot copies disappear |
| Last called (computed) | Computed: `max(calling.call_log.initiated_at)` | |
| Order rows via `/api/crm/customers/:id/orders` | `public.order_analytics` | Join moves to `identity_key` |
| Fetched order rows (React state) | Not persisted | Request cache |

## Customer detail — Cats & TrueHunt experience

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| How many cats (computed) | `public.cat_count.count` | Blocked on migration 002 |
| LS `cats[].name` | `calling.cat_profile.name`, linked to `public.cat_names.id` via `cat_name_id` | Held locally too, so a cat with no `cat_names` row is still nameable |
| LS `cats[].age` | `calling.cat_profile.age` | Free text: "about 2", "8 months" |
| LS `cats[].breed` | `calling.cat_profile.breed` | As the customer describes it |
| LS `cats[].trueHuntAcceptability` | `calling.cat_profile.truehunt_response` | Per-cat, so three cats give three answers |
| LS `cats[].catExperience` | `calling.cat_profile.cat_comment` | Per-cat free text |
| LS `customers[].overallExperience` | `calling.customer_additional_info.overall_experience` | Written only via an approved `customer_info_entry` |
| LS `customers[].benefitsNoticed` | `calling.customer_additional_info.benefits_noticed` | Same |
| LS `customers[].feedingSplit` | `calling.customer_additional_info.feeding_split` | Same |
| LS `customers[].dryBrands[]` | `calling.customer_additional_info.dry_brands` | `text[]` |
| LS `customers[].wetBrands[]` | `calling.customer_additional_info.wet_brands` | `text[]` |
| LS `customers[].packetsPerDay` | `calling.customer_additional_info.packets_per_day` | `numeric`, halves preserved |
| LS `customers[].buysFrom[]` | `calling.customer_additional_info.buys_from` | `text[]` |
| LS `customers[].catBehaviourNotes` | `calling.customer_additional_info.cat_behaviour_notes` | Same |
| LS `customers[].familyInfo` | `calling.customer_additional_info.family_info` | Same |
| LS `customers[].photo` (base64) | `calling.customer_additional_info.photo_url` | Image moves to object storage; the column holds a link |
| LS `infoEntries[]` | `calling.customer_info_entry` | Direct match, plus `approved` / `approved_by` / `approved_at`, which the local model had no equivalent for |
| Draft "add entry" text (React state) | Not persisted | UI state |

## Customer detail — Orders panel

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| LS `orders[].orderNumber` | `public.order_analytics` | See DROPPED ON PURPOSE |
| LS `orders[].orderDate` | `public.order_analytics` | |
| LS `orders[].deliveryStatus` | `public.orders.fulfillment_status` | |
| LS `orders[].deliveryDate` | `public.orders.fulfillments` | jsonb |
| LS `orders[].amount` | `public.order_analytics` | |
| LS `orders[].items` | `public.order_items` | |

## Customer detail — Pre-call brief

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| "What to know" summary | Not persisted — regenerated per call | No column proposed |
| "Worth asking" questions | Not persisted — regenerated per call | |
| Brief result (React state) | Not persisted | |

## Customer detail — Engagement

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| `public.kwik_messages` | Unchanged, read live | |
| `public.kwik_message_logs` | Unchanged, read live | |
| `public.abandoned_carts` | Unchanged, read live | |
| "File this message under…" → LS `infoEntries[]` | `calling.customer_info_entry`, `source_id` → `public.data_sources` | The registry is what makes it traceable |

## Call queue — Priority tab

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| Rank | Computed | |
| Name, phone, city | `public.customer_segments` | |
| Segment badge | `public.customer_segments.segment` | |
| Segment chips + counts | `public.segment_definitions` | |
| Reorder due | Computed from `public.order_analytics` | Join moves from phone digits to `identity_key` |
| Orders | `public.customer_segments.orders` | |
| Biggest order | `public.customer_segments.max_order` | |
| Last order | `public.customer_segments.last_order_at` | |
| Priority score | Computed | Weights unchanged |
| Score drivers | Computed | |
| Segment filter / sort / search (React state) | Not persisted | UI state |
| Row → local customer (LS `customers[]`) | **Removed** | No local row is created; `identity_key` comes off the queue row |

## Call queue — local tabs

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| LS `tickets[].scheduledFor` | `calling.follow_up_ticket.scheduled_for` | |
| LS `tickets[].status` | `calling.follow_up_ticket.status` | Constrained to open / done / cancelled |
| LS `tickets[].attemptCount` | `calling.follow_up_ticket.attempt_count` | |
| LS `tickets[].lastCallId` | `calling.follow_up_ticket.call_id` | Now a real foreign key |
| LS `tickets[].notes` | `calling.follow_up_ticket.notes` | Added by 003 |
| Active tab / search (React state) | Not persisted | UI state |

## Call flow

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| LS `calls[].phoneNumber` | `calling.call_log.phone_norm` | Records which number was actually dialled |
| Call phase (React state) | Row exists from dial | `initiated_at` defaults to now() on insert, so a refresh no longer loses the call |
| LS `calls[].revealedAt` | `calling.call_log.revealed_at` | Added by 003 |
| LS `calls[].ringingAt` | `calling.call_log.ringing_at` | Added by 003 |
| LS `calls[].connectedAt` | `calling.call_log.connected_at` | |
| LS `calls[].endedAt` | `calling.call_log.ended_at` | |
| LS `calls[].completedAt` | `calling.call_log.wrapped_up_at` | Added by 003; later than `ended_at` |
| LS `calls[].status` | Derived from the six `call_log` timestamps | No status column: the timeline makes the state derivable |
| LS `calls[].durationSec` | `calling.call_log.duration_sec` | |
| LS `calls[].notConnectedReason` | `calling.call_log.not_connected_reason` | With `outcome = 'not_connected'` |
| LS `calls[].disposition` | `calling.call_log.disposition` | CHECK: interested / ordered / callback / do_not_call |
| LS `calls[].orderNumber` | `calling.call_log.order_number` | The number only; the order stays in `public.order_analytics` |
| Callback date/time | `calling.follow_up_ticket.scheduled_for` | |
| 2-day auto follow-up | Computed → `calling.follow_up_ticket` row | Rule stays in application code |
| Do-not-call flag | `calling.customer_additional_info.do_not_call` | |
| LS `customers[].status` | `calling.customer_additional_info.status` | Added by 003. CHECK: active / lost / paused |
| LS `customers[].notes` | `calling.customer_info_entry` with `field_name = 'customer_note'` | No new column; the append-only log already holds free text |
| LS `calls[].initiatedBy` | `calling.call_log.initiated_by` → `calling.app_user.id` | |
| LS `calls[].initiatedByName` | Joined from `calling.app_user.name` | No longer copied onto the call |

## Call notes & extraction

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| LS `noteEntries[].rawText` | `calling.call_note.raw_text` | `not null` — an empty note is not a note |
| LS `noteEntries[].callId` | `calling.call_note.call_id` | `on delete cascade` |
| LS `noteEntries[].createdBy` | `calling.call_note.author_id` | |
| Previous notes | `calling.call_note` by `identity_key` | Now visible to the whole team, not one browser |
| Extracted field suggestions | Not persisted until approved | |
| Which column each value goes to | Computed (`FIELD_META`) | Application code |
| Approved / dropped / edited rows (React state) | `calling.customer_info_entry.approved`, `.approved_by`, `.approved_at` | The approval step gains a record |
| LS `noteEntries[].appliedFields` | `calling.customer_info_entry.call_id` | The link is the FK, not a copied list |

## Dashboard

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| Total customers | `public.customer_segments` | Becomes the real number, not one browser's |
| Avg days to first order | Computed: `min(public.order_analytics.order_at)` − `public.client_identity.first_seen_at` | **Currently returns −9.7 days.** See caveat below |
| Follow-ups due / overdue | `calling.follow_up_ticket` | Partial index covers the open ones |
| Subscription interest / confirmed | `calling.customer_additional_info.subscription_interest`, `.subscription_status` | Added by 003. Was boolean locally, now text — needs a mapping rule |
| Upcoming follow-ups list | `calling.follow_up_ticket` | |
| Recently called list | `calling.call_log` ordered by `initiated_at desc` | Index is DESC to match |

## Auth & session

| Current location (localStorage key or CRM table) | New destination table.column | Notes |
|---|---|---|
| localStorage key `calldesk.session` | Server-side session keyed on `calling.app_user.id` | The key disappears |
| LS `users[].name` | `calling.app_user.name` | |
| LS `users[].email` | `calling.app_user.email` | Now `not null unique` |
| Google ID token | `calling.app_user.google_sub` | The stable Google id is stored; the token is not |
| `ALLOWED_EMAIL_DOMAIN` | Environment config | Not database state |

---

## Caveat — the two partial mappings

Both were verified against the live database on 3 Sep 2026 and both are weaker
than they look. They are mapped rather than left homeless, but neither is sound
enough to put on a dashboard as-is.

**Signup date → `public.client_identity.first_seen_at`.**
`client_identity` has no `identity_key` column — its primary key is `client_id`,
and the only routes in are `phone` and `customer_id`. Joining
`customer_segments` to it on normalised phone matches **1,266 of 3,766
customers (34%)**. The table's 2,917 rows are mostly anonymous web sessions:
1,586 carry a phone, 1,426 carry a `customer_id`. Joining via Shopify
`customer_id` instead is worse — 562. So any metric built on this covers a third
of customers, and reaching it breaks the "join on identity_key" rule.

**Avg days to first order → `min(order_analytics.order_at) − first_seen_at`.**
Computable for those same 1,266 customers. Run today it returns **−9.7 days**,
because **243 of the 1,266 (19%) have their first order before `first_seen_at`**.
That is not a data error: `first_seen_at` is when a browser session was first
seen, not when the person signed up, so it can postdate an order placed on
another device or before tracking started. The metric is mapped, but it does not
currently produce a usable number. Open decision 4 in DATABASE_ARCHITECTURE.md
asks Siddharth whether a real signup date exists anywhere.

## NOWHERE TO GO

Everything here needs another person's decision. Nothing on this list is
blocked on work we can do ourselves.

| Field | Captured at | Question | Who decides |
|---|---|---|---|
| **Cat photo** | `customers[].photo` (base64 today) | `calling.customer_additional_info.photo_url` exists but has nothing to point at. Do photos go to S3, or somewhere else? | **Samriddhi / Manish** |
| **New customer creation** | New customer modal, all fields | Shopify owns the customer master and we have no table to create one in. Should the app be able to create a customer at all, or does the screen go? | **Manish** |
| **A real signup date** | `customers[].signupDate` | `client_identity.first_seen_at` covers 34% and predates the first order in only 81% of those. Does a true signup date exist anywhere in the CRM? Without one, days-to-first-order cannot be computed honestly | **Siddharth** |
| **Cat identity across phone numbers** | `cats[]` | `public.cat_names` and `public.cat_count` are keyed on `phone`, which breaks for a customer with several numbers. `migrations/002_pending_approval.sql` adds `identity_key` to both and is written but unrun. Both tables are still empty, so it costs nothing today | **Siddharth** |
| **Cat `foodAmountComment`** | `cats[]` | `cat_profile` has no column for it. Add, or drop? | **Samriddhi** |
| **Cat `trueHuntPreference`** | `cats[]` | Same question | **Samriddhi** |
| **Cat `generalFoodPreference`** | `cats[]` | Same question | **Samriddhi** |
| **Cat `palatability`** | `cats[]` | Overlaps `cat_profile.truehunt_response`. Merge into it, or keep separate? | **Samriddhi** |
| **Cat `eatingHabits`** | `cats[]` | Overlaps `customer_additional_info.feeding_split`, but per-cat. Add to `cat_profile`, or fold in? | **Samriddhi** |

`customers[].customerCode` is not listed: it was a local display id with no
meaning outside the browser store, and `identity_key` replaces it. It is in
DROPPED ON PURPOSE.

## DROPPED ON PURPOSE

| What | Reason |
|---|---|
| **Local `orders` collection** — `orders[]` (orderNumber, orderDate, deliveryStatus, deliveryDate, amount, items) | Shopify is the source of truth for orders; all order data lives in `public.order_analytics` and is never duplicated |
| **`customers[].ordersCount`** | A point-in-time copy taken at import that drifts the moment a new order lands; read live from `public.customer_segments.orders` |
| **`customers[].totalSpent`** | Same drift, and a stale spend figure is actively misleading on a sales call |
| **`customers[].lastOrderDate`** | Same drift, and it drives the reorder-due calculation, so a stale value misranks the whole queue |
| `customers[].foodFeedback` | Retired: replaced by the single `overall_experience` field; no screen writes it |
| `customers[].packagingFeedback` | Retired: folded into `overall_experience` |
| `customers[].brandFeedback` | Retired: folded into `overall_experience` |
| `customers[].validityFeedback` | Retired: folded into `overall_experience` |
| `customers[].likes` | Retired: superseded by `overall_experience` and `benefits_noticed` |
| `customers[].dislikes` | Retired: superseded by `overall_experience` |
| `customers[].suggestions` | Retired: no screen captures it any more |
| `customers[].productExpectations` | Retired: no screen captures it any more |
| `customers[].priceFeedback` | Retired: pricing is part of `overall_experience` |
| `customers[].otherFeedback` | Retired: no screen captures it any more |
| `customers[].currentFoodTypes` | Retired: replaced by `feeding_split`, `dry_brands` and `wet_brands` |
| `customers[].otherBrands` | Retired: split into `dry_brands` and `wet_brands` |

The twelve retired columns are **not migrated**. Any values sitting in a
browser today should be exported to CSV before that browser's storage is
cleared — they exist nowhere else, and clearing site data destroys them.

Also dropped, though not columns: the **CRM bulk import into localStorage**, and
the **local customer row created when a queue row is opened**. Both exist only
to give the browser store something to hold, and neither has a purpose once the
screens read `public` directly.
