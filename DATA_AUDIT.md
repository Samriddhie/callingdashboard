# Data audit — where everything currently lives

Pre-migration inventory for the move to EC2 + a real database.
Produced by reading the repo; no code was changed.

**Two stores exist today:**

1. **`localStorage`, key `calldesk.data.v2`** — one JSON blob holding eight
   collections: `users`, `customers`, `cats`, `orders`, `calls`, `noteEntries`,
   `infoEntries`, `tickets`. Everything the calling team creates lives here.
   Per-browser, per-machine, not backed up, not shared.
2. **`truehunt_crm` Postgres (localhost:5432), read-only** — the Shopify sync.
   The connection sets `default_transaction_read_only = on`
   (`server/crm.js:12`), so the app cannot write to it.

A third key, **`calldesk.session`**, holds the signed-in user id.

Legend: **LS** = localStorage `calldesk.data.v2`. **CRM** = read-only Postgres
via the Express backend. **State** = React state, lost on refresh.

---

## Customer list (`src/pages/CustomersPage.jsx`)

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Name | Customers table | LS → `customers[].name` | Both | `src/pages/CustomersPage.jsx` |
| Phone | Customers table | LS → `customers[].phone` | Both | `src/pages/CustomersPage.jsx` |
| City | Customers table | LS → `customers[].city` | Both | `src/pages/CustomersPage.jsx` |
| Cats (count) | Customers table | **Computed** — `cats.filter(customerId)` length | Read | `src/pages/CustomersPage.jsx` |
| Orders | Customers table | LS → `customers[].ordersCount` (copied from CRM at import) | Read | `src/pages/CustomersPage.jsx` |
| Spent | Customers table | LS → `customers[].totalSpent` (copied from CRM at import) | Read | `src/pages/CustomersPage.jsx` |
| Last order | Customers table | **Computed** — `customer.lastOrderDate \|\| firstOrderDate(orders)` | Read | `src/pages/CustomersPage.jsx:214` |
| Calls (count) | Customers table | **Computed** — `calls.filter(customerId)` length | Read | `src/pages/CustomersPage.jsx` |
| Last called | Customers table | LS → `customers[].lastCalledAt` | Both | `src/pages/CustomersPage.jsx` |
| Search query | Customers table | **State** — `useState('')` | Both | `src/pages/CustomersPage.jsx:13` |
| CRM import (bulk) | "Import from CRM" | **CRM** → `GET /api/crm/customers` (paged 500) → written into LS | Both | `src/data/api.js:11` |
| CSV export/import | Customers page | LS ↔ file download/upload | Both | `src/data/csv.js` |

## New customer (`src/components/NewCustomerModal.jsx`)

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Name, phone, email, city | New customer modal | LS → `customers[]` | Written | `src/components/NewCustomerModal.jsx` |
| Signup date | New customer modal | LS → `customers[].signupDate` (defaults to now) | Written | `src/data/schema.js` |
| First order number / date / amount | New customer modal | LS → `orders[]` | Written | `src/components/NewCustomerModal.jsx` |
| Draft form values | New customer modal | **State** — lost on refresh | Both | `src/components/NewCustomerModal.jsx:8` |

## Customer detail — header (`src/pages/CustomerDetailPage.jsx`)

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Customer name | Detail header | LS → `customers[].name` | Read | `src/pages/CustomerDetailPage.jsx:94` |
| Segment (name, orders, recency) | `SegmentInline` in header | **CRM** → `GET /api/crm/segment?phone=` | Read | `src/components/CustomerContext.jsx:20` |
| Segment history trail | `SegmentInline` → "history" | **CRM** → `segment_history` + `customer_segment_history`, runs collapsed | Read | `server/crm.js` |
| Last order | Detail header metric | LS → `customers[].lastOrderDate` | Read | `src/pages/CustomerDetailPage.jsx:131` |
| Cats (count) | Detail header metric | **Computed** — `ownCats.length` | Read | `src/pages/CustomerDetailPage.jsx:135` |
| Calls (count) | Detail header metric | **Computed** — own calls length | Read | `src/pages/CustomerDetailPage.jsx:137` |
| Shopify deep link | Header button | **Computed** from `/api/health` → `shopifyStore` + `sourceId`. Currently `null` — unset | Read | `src/data/api.js:75` |

## Customer detail — Customer summary (`src/components/ShopifySummary.jsx`)

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Customer, Email, City | Customer summary card | LS → `customers[]` | Read | `src/components/ShopifySummary.jsx:37` |
| Orders, Total spent, Last order | Customer summary card | LS mirror of CRM values | Read | `src/components/ShopifySummary.jsx:41` |
| Last called | Customer summary card | **Computed** — `fmtRelative(lastCalledAt)` | Read | `src/components/ShopifySummary.jsx:44` |
| Recent order rows | Customer summary card | **CRM** → `GET /api/crm/customers/:sourceId/orders` | Read | `src/data/api.js:49` |
| Fetched order rows | Customer summary card | **State** — refetched every mount | Read | `src/components/ShopifySummary.jsx:17` |

## Customer detail — Cats & TrueHunt experience (`src/components/CatsPanel.jsx`)

All of this is LS-only. Nothing here reaches any database.

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| How many cats | Cats section | **Computed** from `cats[]` count; dropdown adds/removes rows | Both | `src/components/CatsPanel.jsx` |
| Cat name | Cats section | LS → `cats[].name` | Both | `src/components/CatsPanel.jsx` |
| Cat age | Cats section | LS → `cats[].age` | Both | `src/components/CatsPanel.jsx` |
| Cat breed | Cats section | LS → `cats[].breed` | Both | `src/components/CatsPanel.jsx` |
| Did your cat like the food? | TrueHunt food experience | LS → `cats[].trueHuntAcceptability` | Both | `src/components/CatsPanel.jsx` |
| Any comment (per cat) | TrueHunt food experience | LS → `cats[].catExperience` + `infoEntries[]` | Both | `src/components/CatsPanel.jsx` |
| Feedback (packaging, smell, texture, ingredients, brand, pricing) | TrueHunt food experience | LS → `customers[].overallExperience` + `infoEntries[]` | Both | `src/components/CatsPanel.jsx` |
| Benefits | TrueHunt food experience | LS → `customers[].benefitsNoticed` + `infoEntries[]` | Both | `src/components/CatsPanel.jsx` |
| What kind of food, and how often | General food experience | LS → `customers[].feedingSplit` + `infoEntries[]` | Both | `src/components/CatsPanel.jsx` |
| Dry brands (multiselect) | General food experience | LS → `customers[].dryBrands[]` | Both | `src/components/CatsPanel.jsx` |
| Wet brands (multiselect) | General food experience | LS → `customers[].wetBrands[]` | Both | `src/components/CatsPanel.jsx` |
| Packets per day (0.5 steps) | General food experience | LS → `customers[].packetsPerDay` | Both | `src/components/CatsPanel.jsx` |
| Where do they buy from | General food experience | LS → `customers[].buysFrom[]` | Both | `src/components/CatsPanel.jsx` |
| Cat behaviour / disease / habit | General food experience | LS → `customers[].catBehaviourNotes` + `infoEntries[]` | Both | `src/components/CatsPanel.jsx` |
| Customer and family information | Family section | LS → `customers[].familyInfo` + `infoEntries[]` | Both | `src/components/CatsPanel.jsx` |
| Cat/customer photo | Customer record | LS → `customers[].photo` as a **base64 JPEG data URL** | Both | `src/data/photo.js` |
| Append-only entry history | `InfoHistory` under each field | LS → `infoEntries[]` (value, previousValue, source, callId, occurredAt, author) | Both | `src/components/InfoHistory.jsx` |
| Draft text in "add entry" box | `InfoHistory` | **State** — lost on refresh | Both | `src/components/InfoHistory.jsx:67` |

## Customer detail — Orders panel (`src/components/OrdersPanel.jsx`)

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Order number | Orders panel | LS → `orders[].orderNumber` | Both | `src/components/OrdersPanel.jsx` |
| Order date | Orders panel | LS → `orders[].orderDate` | Both | `src/components/OrdersPanel.jsx` |
| Delivery status | Orders panel | LS → `orders[].deliveryStatus` | Both | `src/components/OrdersPanel.jsx` |
| Delivery date | Orders panel | LS → `orders[].deliveryDate` | Both | `src/components/OrdersPanel.jsx` |
| Amount | Orders panel | LS → `orders[].amount` | Both | `src/components/OrdersPanel.jsx` |
| Items | Orders panel | LS → `orders[].items` | Both | `src/components/OrdersPanel.jsx` |

## Customer detail — Pre-call brief (`src/components/CustomerContext.jsx`)

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| "What to know" summary | Pre-call brief | **Computed by LLM** — `POST /api/ai/brief`. Not persisted; regenerated each time | Read | `src/data/api.js:116` |
| "Worth asking" questions | Pre-call brief | **Computed by LLM** — same call | Read | `src/components/CustomerContext.jsx:107` |
| Brief result | Pre-call brief | **State** — lost on refresh | Read | `src/components/CustomerContext.jsx:107` |

## Customer detail — Engagement (`src/components/EngagementPanel.jsx`)

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| WhatsApp messages | Engagement panel | **CRM** → `kwik_messages` via `GET /api/gokwik/engagement` | Read | `server/gokwik.js:22` |
| Message delivery logs | Engagement panel | **CRM** → `kwik_message_logs` | Read | `server/gokwik.js:50` |
| Abandoned carts | Engagement panel | **CRM** → `abandoned_carts` | Read | `server/gokwik.js:66` |
| "File this message under…" | Engagement panel | LS → `infoEntries[]` with `source:'gokwik'`, `interactionId`, `occurredAt` | Written | `src/components/EngagementPanel.jsx` |

## Call queue — Priority tab (`src/pages/PriorityQueue.jsx`)

Entirely CRM-backed and stateless; nothing here is persisted locally until a row is opened.

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Rank | Priority queue | **Computed** — row order | Read | `src/pages/PriorityQueue.jsx` |
| Name, phone, city | Priority queue | **CRM** → `GET /api/crm/queue` | Read | `server/crm.js` |
| Segment badge | Priority queue | **CRM** → `customer_segments` | Read | `server/crm.js` |
| Segment chips + counts | Priority queue | **CRM** → `GET /api/crm/segments` (`segment_definitions`) | Read | `server/crm.js` |
| Reorder due (`dueInDays`) | Priority queue | **Computed in SQL** — `expected_gap − recency_days`; gap = median inter-order gap clamped 7–120, default 30 | Read | `server/crm.js:296` |
| Orders | Priority queue | **CRM** → `customer_segments.orders` | Read | `server/crm.js` |
| Biggest order (`maxOrder`) | Priority queue | **CRM** → `customer_segments.max_order` | Read | `server/crm.js` |
| Last order | Priority queue | **CRM** → `customer_segments.last_order_at` | Read | `server/crm.js` |
| Priority (0–100) | Priority queue | **Computed in SQL** — `40·due + 20·value + 15·habit + 15·frequency + 10·segment` | Read | `server/crm.js:325` |
| Score drivers | Priority queue | **Computed in SQL** — returned per row | Read | `server/crm.js:365` |
| Segment filter / sort / search | Priority queue | **State** — lost on refresh | Both | `src/pages/PriorityQueue.jsx:47` |
| Row → local customer | "Open" / "Call" | LS → `customers[]` created on demand, matched by `sourceId` then last-10 phone digits | Written | `src/pages/PriorityQueue.jsx` |

## Call queue — local tabs (`src/pages/CallQueuePage.jsx`)

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Follow-up tickets | Call queue tabs | LS → `tickets[]` (`scheduledFor`, `status`, `attemptCount`) | Both | `src/pages/CallQueuePage.jsx` |
| Active tab / search | Call queue tabs | **State** — lost on refresh | Both | `src/pages/CallQueuePage.jsx:19` |

## Call flow (`src/components/CallModal.jsx`)

**Nothing in this modal is persisted until "Save call". A refresh mid-call loses the entire call.**

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Phone number dialled | Call modal (reveal) | LS → `calls[].phoneNumber` on save | Written | `src/data/schema.js` |
| Call phase (reveal/connected/wrapup) | Call modal | **State** — lost on refresh | Both | `src/components/CallModal.jsx:54` |
| Connected at / elapsed / duration | Call modal timer | **State** until save → LS `calls[].connectedAt`, `.durationSec` | Both | `src/components/CallModal.jsx:56` |
| Not-connected reason | Call modal | **State** until save → LS `calls[].notConnectedReason` | Both | `src/components/CallModal.jsx:60` |
| Disposition (interested to buy / ordered / callback / do not call) | Call modal wrap-up | **State** until save → LS `calls[].disposition` | Both | `src/components/CallModal.jsx:61` |
| Order number (if ordered) | Call modal wrap-up | **State** until save → LS `calls[].orderNumber` | Both | `src/components/CallModal.jsx:64` |
| Callback date/time | Call modal wrap-up | **State** until save → LS `tickets[].scheduledFor` | Both | `src/components/CallModal.jsx:63` |
| 2-day auto follow-up | Call modal wrap-up | **Computed** — `dispositionMeta(disposition).followUpDays` | Written | `src/data/DataContext.jsx` |
| Do-not-call flag | Call modal wrap-up | LS → `customers[].doNotCall` + `status:'lost'` | Written | `src/data/DataContext.jsx` |
| Initiated by | Call modal | LS → `calls[].initiatedBy`, `.initiatedByName` from session user | Written | `src/data/schema.js` |

## Call notes & extraction

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Note text (the source record) | Call modal → Notes | **State** until save → LS `noteEntries[].rawText` | Both | `src/components/CallModal.jsx:62` |
| Previous notes (collapsed) | Call modal | LS → `noteEntries[]` filtered by customer, newest first | Read | `src/components/CallModal.jsx:76` |
| Extracted field suggestions | `ExtractionReview` | **Computed** — `POST /api/extract` (LLM) or the rule-based fallback | Read | `src/data/extract.js:25` |
| Which column each value goes to | `ExtractionReview` | **Computed** — `FIELD_META` grouped by section | Read | `server/index.js` |
| Approved / dropped / edited rows | `ExtractionReview` | **State** — lost on refresh | Both | `src/components/CallModal.jsx:86` |
| Applied fields record | On save | LS → `noteEntries[].appliedFields` + one `infoEntries[]` row each | Written | `src/data/DataContext.jsx` |

## Dashboard (`src/pages/DashboardPage.jsx`)

Reads **local** data only — not the CRM. Numbers here reflect one browser's records.

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Total customers | Stat tile | **Computed** — `customers.length` from LS | Read | `src/pages/DashboardPage.jsx` |
| Avg days to first order | Stat tile hint | **Computed** — mean of `signupDate → first orderDate`; skips anyone missing either | Read | `src/pages/DashboardPage.jsx:68` |
| Follow-ups due / overdue | Stat tiles | **Computed** from LS `tickets[]` | Read | `src/pages/DashboardPage.jsx:60` |
| Subscription interest / confirmed | Stat tiles | **Computed** from LS `customers[]` | Read | `src/pages/DashboardPage.jsx:62` |
| Upcoming follow-ups list | Dashboard | LS → `tickets[]` | Read | `src/pages/DashboardPage.jsx:150` |
| Recently called list | Dashboard | LS → `calls[]` sorted by `initiatedAt` | Read | `src/pages/DashboardPage.jsx:207` |

## Auth & session

| Field shown or captured in UI | Which screen/component | Where it currently lives | Read, written, or both | File path |
|---|---|---|---|---|
| Signed-in user id | Whole app | **localStorage key `calldesk.session`** | Both | `src/data/storage.js:138` |
| User name / email | Login screen | LS → `users[]` | Both | `src/auth/AuthContext.jsx` |
| Google ID token | Login screen | Sent to `POST /api/auth/google`; not stored | Read | `src/auth/AuthContext.jsx:54` |
| Allowed email domain | Backend | `server/.env` → `ALLOWED_EMAIL_DOMAIN` (currently unset) | Read | `server/index.js` |

---

## Findings that affect the migration

1. **All operator-generated data is in one browser.** Cats, calls, notes,
   feedback, `infoEntries`, tickets, locally-added customers and orders.
   Clearing site data destroys it; a second employee sees an empty app.
   There is no export path other than the CSV on the customers page.

2. **Photos are base64 data URLs inside the same JSON blob**
   (`src/data/photo.js`). They are downscaled to fit the ~5 MB localStorage
   quota. On Postgres these need object storage or a `bytea`/S3 decision.

3. **An in-flight call exists only in React state.** Phase, timer, disposition,
   note text and extraction results are all `useState` in `CallModal`. A
   refresh or crash mid-call loses the whole call with no trace.

4. **Local `orders` duplicate Shopify.** `orders[]` in localStorage is written
   by `OrdersPanel` and `NewCustomerModal`, separate from the CRM order data.
   Two sources disagree by design today.

5. **`ordersCount`, `totalSpent`, `lastOrderDate` are point-in-time copies.**
   Snapshotted into `customers[]` at CRM import and never refreshed, so the
   customer list and summary drift from the CRM as soon as a new order lands.

6. **The join key is a phone-digit match, not an id.** The queue and segment
   lookups match on the last 10 digits of the phone number
   (`server/crm.js`), and `PriorityQueue` matches rows to local customers by
   `sourceId` first, then last-10 digits. One customer with two numbers
   becomes two records.

7. **`calls[].phoneNumber` already records the number dialled**
   (`src/data/schema.js`) — that constraint is satisfiable without a schema
   change, but only because a call is stored per call rather than per customer.

8. **Retired columns still occupy the schema.** `makeCustomer` carries
   `foodFeedback`, `packagingFeedback`, `brandFeedback`, `validityFeedback`,
   `likes`, `dislikes`, `suggestions`, `productExpectations`, `priceFeedback`,
   `otherFeedback`, `currentFoodTypes`, `otherBrands`; `makeCat` carries
   `previousBrand`, `whySwitched`, `preferredFlavour`, `eats` and others. No
   screen writes them any more. They should not be carried into the new schema
   without a decision on the existing values.

9. **Three integrations are unconfigured** (`GET /api/health` reports
   `anthropicConfigured:false`, `shopifyStore:null`, `googleConfigured:false`).
   Note extraction silently falls back to keyword matching, Shopify links have
   no store, and sign-in falls back to local name/email with no domain
   restriction.

10. **The CRM has empty tables built for this data** — `cat_names`
    (phone, cat_name, name_known, name_source, health_notes, preferred_sku),
    `cat_count`, `wa_cat_names` — all 0 rows. Whether they are the intended
    destination needs confirming before anything is written to them.
