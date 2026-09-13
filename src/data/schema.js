// Normalized record shapes. Customer id is the key everything else hangs off —
// never the phone number, which changes and isn't unique.
//
//   Customer 1──* Cat
//            1──* Order
//            1──* Call ──1 NoteEntry
//            1──* Ticket (open callback)
//            1──* InfoEntry (append-only history of every field)

export const SCHEMA_VERSION = 3

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/* ------------------------------------------------------------------ */
/* Call lifecycle                                                      */
/* ------------------------------------------------------------------ */

// The state machine. `next` lists the states an agent can legally move to.
// Terminal states are the only ones that let the call popup close.
export const CALL_STATES = {
  // UI-only, and deliberately so: revealing the number is not a call attempt,
  // so nothing is written to `calls` while the popup is in this state. It exists
  // here only to label the badge before a record exists.
  revealed: {
    label: 'Number revealed',
    hint: 'Nothing is logged yet — the attempt is recorded when you dial.',
    tone: 'bg-gray-100 text-gray-600',
    terminal: false,
    persisted: false,
  },
  initiated: {
    label: 'Call attempt initiated',
    hint: 'Attempt logged. Waiting on the outcome of the call.',
    tone: 'bg-blue-50 text-blue-700',
    terminal: false,
  },
  // Kept so calls logged before the Ringing button was removed still render a
  // label. Nothing sets this state any more.
  ringing: {
    label: 'Ringing',
    hint: 'Waiting for them to pick up.',
    tone: 'bg-amber-50 text-amber-700',
    terminal: false,
  },
  connected: {
    label: 'Connected',
    hint: 'Call in progress.',
    tone: 'bg-green-50 text-green-700',
    terminal: false,
  },
  ended: {
    label: 'Call ended',
    hint: 'Log how it went before you close this.',
    tone: 'bg-gray-100 text-gray-700',
    terminal: false,
  },
  notConnected: {
    label: 'Not connected',
    tone: 'bg-red-50 text-red-700',
    terminal: true,
  },
  didntCall: {
    label: "Didn't call",
    tone: 'bg-gray-100 text-gray-500',
    terminal: true,
  },
  completed: {
    label: 'Completed',
    tone: 'bg-green-50 text-green-700',
    terminal: true,
  },
}

// Why a call failed to connect. In a telephony integration these arrive from the
// provider; here the agent picks one.
export const NOT_CONNECTED_REASONS = [
  { value: 'noAnswer', label: 'No answer', icon: 'ti-phone-off' },
  { value: 'busy', label: 'Busy', icon: 'ti-phone-x' },
  { value: 'voicemail', label: 'Went to voicemail', icon: 'ti-message-dots' },
  { value: 'switchedOff', label: 'Switched off / unreachable', icon: 'ti-signal-off' },
  { value: 'wrongNumber', label: 'Wrong number', icon: 'ti-alert-triangle' },
]

/**
 * Agent-entered wrap-up, captured only when the call actually connected.
 *
 * The question these answer is "are they interested to buy?", so the answers
 * say what the customer intends about buying and nothing else. "Interested"
 * on its own was ambiguous — interested in the food, in the offer, in being
 * left alone? — so it reads "Interested to buy". A customer who dislikes the
 * product but will still reorder is not the same person as one who asked not
 * to be called, and only the second one is "Do not call".
 */
export const DISPOSITIONS = [
  {
    value: 'interested',
    label: 'Interested to buy',
    icon: 'ti-thumb-up',
    tone: 'bg-green-50 text-green-700',
    // Interest goes cold fast. Saying yes on a call earns an automatic
    // follow-up rather than relying on the agent to remember to book one.
    followUpDays: 2,
  },
  {
    value: 'ordered',
    label: 'Ordered',
    icon: 'ti-shopping-cart',
    tone: 'bg-blue-50 text-blue-700',
  },
  {
    value: 'callback',
    label: 'Callback',
    icon: 'ti-clock',
    tone: 'bg-amber-50 text-amber-700',
  },
  {
    value: 'doNotCall',
    label: 'Do not call',
    icon: 'ti-phone-off',
    tone: 'bg-red-50 text-red-700',
  },
]

// No longer offered, kept so calls logged under the old wording still render
// a label instead of a blank badge.
export const RETIRED_DISPOSITIONS = [
  {
    value: 'notInterested',
    label: 'Not interested',
    icon: 'ti-thumb-down',
    tone: 'bg-red-50 text-red-700',
  },
  { value: 'other', label: 'Other', icon: 'ti-dots', tone: 'bg-gray-100 text-gray-600' },
]

export const ALL_DISPOSITIONS = [...DISPOSITIONS, ...RETIRED_DISPOSITIONS]

export const dispositionMeta = (value) =>
  ALL_DISPOSITIONS.find((d) => d.value === value) || null

/* ------------------------------------------------------------------ */
/* Other vocabularies                                                  */
/* ------------------------------------------------------------------ */

export const DELIVERY_STATUSES = [
  { value: 'pending', label: 'Pending', tone: 'bg-gray-100 text-gray-600' },
  { value: 'shipped', label: 'Shipped', tone: 'bg-blue-50 text-blue-700' },
  { value: 'delivered', label: 'Delivered', tone: 'bg-green-50 text-green-700' },
  { value: 'returned', label: 'Returned', tone: 'bg-red-50 text-red-700' },
]

export const EATS_OPTIONS = [
  { value: 'yes', label: 'Eats it', icon: 'ti-heart', tone: 'bg-green-50 text-green-700' },
  { value: 'no', label: "Doesn't eat", icon: 'ti-heart-off', tone: 'bg-red-50 text-red-700' },
  { value: 'unknown', label: 'Not known', icon: 'ti-help', tone: 'bg-gray-100 text-gray-500' },
]

// How the customer uses TrueHunt for this cat.
export const USAGE_OPTIONS = [
  { value: 'unknown', label: 'Not known' },
  { value: 'mainFood', label: 'Main food' },
  { value: 'treat', label: 'Treat' },
  { value: 'other', label: 'Other' },
]

// Whether the cat got on with whatever they were fed before TrueHunt.
export const PREVIOUS_BRAND_OPINIONS = [
  { value: 'unknown', label: 'Not known' },
  { value: 'liked', label: 'Liked it' },
  { value: 'disliked', label: 'Didn’t like it' },
  { value: 'mixed', label: 'Mixed' },
]

// How well the cat takes to the food. Richer than the yes/no `eats` flag the
// note extractor fills in, and the one the form actually asks for — see
// catPalatability() for how the two reconcile.
export const PALATABILITY_OPTIONS = [
  { value: 'unknown', label: 'Not known', tone: 'bg-gray-100 text-gray-500', icon: 'ti-help' },
  { value: 'loves', label: 'Loves it', tone: 'bg-green-50 text-green-700', icon: 'ti-heart' },
  { value: 'eats', label: 'Eats it', tone: 'bg-green-50 text-green-700', icon: 'ti-check' },
  { value: 'picky', label: 'Picky', tone: 'bg-amber-50 text-amber-700', icon: 'ti-alert-triangle' },
  { value: 'refuses', label: 'Refuses', tone: 'bg-red-50 text-red-700', icon: 'ti-heart-off' },
]

/**
 * The palatability to show for a cat. Extraction still writes the coarse
 * yes/no `eats` flag (the model is prompted for that, and older records only
 * have it), so fall back to it when nobody has picked the richer value.
 */
export function catPalatability(cat) {
  if (cat?.palatability && cat.palatability !== 'unknown') return cat.palatability
  if (cat?.eats === 'yes') return 'eats'
  if (cat?.eats === 'no') return 'refuses'
  return 'unknown'
}

// Breeds, for the dropdown on a cat. Ordered by how often they actually come
// up on calls in India — "Indian domestic" first, the pedigrees after.
export const CAT_BREEDS = [
  'Indian domestic (Billi)',
  'Persian',
  'Tabby',
  'Siamese',
  'Bengal',
  'Maine Coon',
  'Ragdoll',
  'British Shorthair',
  'Himalayan',
  'Turkish Angora',
  'Sphynx',
  'Mixed / crossbreed',
  'Other',
]

// The most cats the "how many cats" dropdown offers. Beyond this it stops
// being a household and the number is almost always a mis-click.
export const MAX_CATS = 12

// How the cat took to TrueHunt, asked per cat rather than per household —
// two cats in the same house rarely agree about food.
export const TRUEHUNT_ACCEPTABILITY = [
  { value: 'unknown', label: 'Not asked yet' },
  { value: 'liked', label: 'Yes' },
  { value: 'somewhatLiked', label: 'A little' },
  { value: 'didntLike', label: 'No' },
]

// The coarse palatability value each acceptability answer implies, so the
// insights that read `palatability` keep working now that the form asks the
// question the other way round.
export const ACCEPTABILITY_TO_PALATABILITY = {
  liked: 'loves',
  somewhatLiked: 'picky',
  didntLike: 'refuses',
  unknown: 'unknown',
}

// Retired: the feeding split is asked as free text now, because "dry in the
// morning, wet at night" is the real answer and no set of chips holds it.
// Kept so records written under the old form still read back.
export const CURRENT_FOOD_TYPES = [
  { value: 'dry', label: 'Dry food' },
  { value: 'wet', label: 'Wet food' },
  { value: 'treat', label: 'Treat' },
  { value: 'mainFood', label: 'Main food' },
  { value: 'other', label: 'Other' },
]

// Suggestions for the "other brands" multi-select. Not a closed list — the
// field also takes anything typed in, because regional brands are endless.
// Half a packet is a real answer — plenty of households split one pouch
// between two cats — so the count is offered in halves rather than typed.
export const PACKETS_PER_DAY = Array.from({ length: 21 }, (_, i) => (i * 0.5).toString())

// Where the household actually buys. Cheaper to ask than to infer from
// Shopify, which only ever sees the orders that came to us.
export const BUY_PLACES = [
  'TrueHunt website',
  'Amazon',
  'Flipkart',
  'Local pet shop',
  'Supermarket',
  'Vet clinic',
  'Quick commerce (Blinkit / Zepto)',
]

export const OTHER_FOOD_BRANDS = [
  'Whiskas',
  'Sheba',
  'Drools',
  'Me-O',
  'Royal Canin',
  'Purepet',
  'Kennel Kitchen',
  'Farmina N&D',
  'Meat Up',
  'Temptations',
  'Applaws',
  'Home cooked',
]

export const CUSTOMER_STATUSES = [
  { value: 'active', label: 'Active', tone: 'bg-green-50 text-green-700' },
  { value: 'inactive', label: 'Inactive', tone: 'bg-gray-100 text-gray-600' },
  { value: 'lost', label: 'Lost', tone: 'bg-red-50 text-red-700' },
]

export const PRODUCT_PREFERENCES = [
  { value: 'treat', label: 'Treat' },
  { value: 'regular', label: 'Regular food' },
  { value: 'both', label: 'Both' },
]

/* ------------------------------------------------------------------ */
/* Where a piece of information came from                              */
/* ------------------------------------------------------------------ */

// Every recorded fact carries the interaction it came out of. A number typed
// in from a call and the same number read off a WhatsApp reply are not equally
// reliable, and six months later nobody remembers which was which.
export const INFO_SOURCES = {
  call: { label: 'Call', icon: 'ti-phone', tone: 'bg-blue-50 text-blue-700' },
  manual: { label: 'Typed in', icon: 'ti-pencil', tone: 'bg-gray-100 text-gray-600' },
  gokwik: { label: 'WhatsApp', icon: 'ti-brand-whatsapp', tone: 'bg-green-50 text-green-700' },
  import: { label: 'CSV import', icon: 'ti-file-import', tone: 'bg-gray-100 text-gray-600' },
  crm: { label: 'Shopify', icon: 'ti-shopping-bag', tone: 'bg-gray-100 text-gray-600' },
}

export const infoSource = (key) => INFO_SOURCES[key] || INFO_SOURCES.manual

/**
 * The structured columns a free-text fact can be filed into.
 *
 * The note is the source record, but nobody reads a year of notes before a
 * call — so anything that matters gets filed here, where the current picture
 * can be read in a few seconds. `scope: 'feedback'` are the ones the feedback
 * panel asks for directly; the rest are asked elsewhere but can still receive
 * a fact lifted out of a WhatsApp reply.
 */
/**
 * The buckets a piece of feedback goes into, offered on the call itself.
 *
 * An agent hearing "your pouch leaks" while the customer is still talking has
 * nowhere to put it except the note, and notes don't get read. These are the
 * same keys the feedback panel shows, so filing it on the call and typing it
 * on the customer page land in one place.
 */
export const FEEDBACK_TOPICS = [
  { key: 'overallExperience', label: 'Feedback' },
  { key: 'benefitsNoticed', label: 'Benefits' },
  { key: 'catBehaviourNotes', label: 'Cat behaviour' },
  { key: 'feedingSplit', label: 'Feeding habits' },
]

export const INFO_FIELDS = [
  {
    key: 'overallExperience',
    label: 'Feedback',
    scope: 'experience',
    placeholder: 'packaging, smell, texture, ingredients, brand, pricing…',
  },
  {
    key: 'benefitsNoticed',
    label: 'Benefits',
    scope: 'experience',
    placeholder: 'coat shinier, firmer stools, more energy…',
  },
  {
    key: 'feedingSplit',
    label: 'Feeding habits',
    scope: 'household',
    placeholder: 'dry twice a day, wet at night, treats on weekends…',
  },
  {
    key: 'catBehaviourNotes',
    label: 'Cat behaviour, disease or habit',
    scope: 'household',
    placeholder: 'kidney diet since March, hides when the bowl is refilled…',
  },
  {
    key: 'familyInfo',
    label: 'Customer and family information',
    scope: 'household',
    placeholder: 'lives with parents in Pune, her mother feeds the cats…',
  },
]

export const infoFieldLabel = (key) =>
  INFO_FIELDS.find((f) => f.key === key)?.label || key

/* ------------------------------------------------------------------ */
/* Factories                                                           */
/* ------------------------------------------------------------------ */

export function makeUser(input = {}) {
  return {
    id: newId('usr'),
    name: (input.name || '').trim(),
    email: (input.email || '').trim(),
    createdAt: new Date().toISOString(),
  }
}

export function makeCustomer(input = {}) {
  const now = new Date().toISOString()
  return {
    id: newId('cus'),
    customerCode: (input.customerCode || '').trim() || `CUST-${Math.floor(Math.random() * 9000) + 1000}`,
    // Shopify's customer id when this row came from the CRM sync. It's what
    // makes a re-sync update the same person instead of duplicating them.
    sourceId: input.sourceId ? String(input.sourceId) : null,
    name: (input.name || '').trim(),
    phone: (input.phone || '').trim(),
    email: (input.email || '').trim(),
    city: (input.city || '').trim(),
    // Straight off the CRM, rather than derived from local order rows.
    lastOrderDate: input.lastOrderDate || null,
    ordersCount: Number(input.ordersCount || 0),
    totalSpent: input.totalSpent == null ? null : Number(input.totalSpent),
    // Signup date anchors "Days to First Order". Defaults to today for walk-ins.
    signupDate: input.signupDate || now,
    status: input.status || 'active',
    productPreference: input.productPreference || 'regular',
    subscriptionInterest: Boolean(input.subscriptionInterest),
    subscriptionStatus: input.subscriptionStatus || null,
    budget: input.budget || '',
    reorderExpectedAt: input.reorderExpectedAt || null,

    // One photo per customer rather than per cat: people send a picture of
    // "the cats", and pinning it to a single cat record loses that.
    photo: input.photo || '',

    /* -- how the household feeds, asked once per customer -------------- */
    // Overall TrueHunt experience: brand packaging and food packaging, which
    // is about the product line rather than about any one cat.
    overallExperience: (input.overallExperience || '').trim(),
    currentFoodTypes: Array.isArray(input.currentFoodTypes) ? input.currentFoodTypes : [],
    // Packets a day across the household. Half-packets are normal, so this is
    // a number with a 0.5 step rather than an integer count.
    packetsPerDay: input.packetsPerDay ?? '',
    // Superseded by dryBrands / wetBrands, kept so older records don't lose
    // what was already collected.
    otherBrands: Array.isArray(input.otherBrands) ? input.otherBrands : [],
    catBehaviourNotes: (input.catBehaviourNotes || '').trim(),
    familyInfo: (input.familyInfo || '').trim(),

    // Set when a call ends in "Do not call". They stay on file — the record of
    // why they left is worth keeping — but they never surface in a queue again.
    doNotCall: Boolean(input.doNotCall),

    /* -- feedback, in the customer's own words ------------------------- */
    // Topic by topic, so "the pouch leaks" and "it's dearer than Whiskas" are
    // not the same paragraph.
    // Free text, because "dry in the morning, wet at night, treats when she
    // yells" is the real answer and no set of chips holds it.
    feedingSplit: (input.feedingSplit || '').trim(),
    dryBrands: Array.isArray(input.dryBrands) ? input.dryBrands : [],
    wetBrands: Array.isArray(input.wetBrands) ? input.wetBrands : [],
    buysFrom: Array.isArray(input.buysFrom) ? input.buysFrom : [],
    benefitsNoticed: (input.benefitsNoticed || '').trim(),

    foodFeedback: (input.foodFeedback || '').trim(),
    packagingFeedback: (input.packagingFeedback || '').trim(),
    brandFeedback: (input.brandFeedback || '').trim(),
    validityFeedback: (input.validityFeedback || '').trim(),
    likes: (input.likes || '').trim(),
    dislikes: (input.dislikes || '').trim(),
    suggestions: (input.suggestions || '').trim(),
    productExpectations: (input.productExpectations || '').trim(),
    priceFeedback: (input.priceFeedback || '').trim(),
    otherFeedback: (input.otherFeedback || '').trim(),
    notes: input.notes || '',
    createdAt: input.createdAt || now,
    lastCalledAt: input.lastCalledAt || null,
  }
}

export function makeCat(input = {}) {
  return {
    id: newId('cat'),
    customerId: input.customerId,

    /* -- the cat itself ------------------------------------------------ */
    name: (input.name || '').trim(),
    age: (input.age || '').trim(),
    breed: (input.breed || '').trim(),

    /* -- TrueHunt experience, per cat ---------------------------------- */
    trueHuntAcceptability: input.trueHuntAcceptability || 'unknown',
    catExperience: (input.catExperience || '').trim(),
    foodAmountComment: (input.foodAmountComment || '').trim(),

    /* -- food preferences ---------------------------------------------- */
    // Free text on purpose: what people say here doesn't fit a dropdown, and
    // guessing the categories before hearing the answers only loses detail.
    trueHuntPreference: (input.trueHuntPreference || '').trim(),
    generalFoodPreference: (input.generalFoodPreference || '').trim(),
    // "Total wet food a day" — kept on the packetsPerDay key because that's
    // what note extraction writes, but no longer forced to be a number.
    packetsPerDay: input.packetsPerDay ?? '',
    previousBrand: (input.previousBrand || '').trim(),
    previousBrandLiked: input.previousBrandLiked || 'unknown',
    palatability: input.palatability || 'unknown',
    palatabilityComments: (input.palatabilityComments || '').trim(),

    // Superseded by the fields above, kept so older records don't lose data.
    whySwitched: (input.whySwitched || '').trim(),
    usage: input.usage || 'unknown',
    preferredFlavour: (input.preferredFlavour || '').trim(),
    eatingHabits: (input.eatingHabits || '').trim(),
    // Kept because the note extractor writes it and old records carry it.
    eats: input.eats || 'unknown',

    notes: input.notes || '',
    createdAt: new Date().toISOString(),
  }
}

export function makeOrder(input = {}) {
  return {
    id: newId('ord'),
    customerId: input.customerId,
    orderNumber: (input.orderNumber || '').trim(),
    orderDate: input.orderDate || new Date().toISOString(),
    deliveryStatus: input.deliveryStatus || 'pending',
    deliveryDate: input.deliveryDate || null,
    amount: input.amount ?? '',
    items: input.items || '',
    createdAt: new Date().toISOString(),
  }
}

// A call is created the moment the agent clicks Call — before anyone picks up —
// so an abandoned attempt is still visible rather than silently lost.
export function makeCall(input = {}) {
  return {
    id: newId('call'),
    customerId: input.customerId,
    phoneNumber: input.phoneNumber || '',
    initiatedBy: input.initiatedBy || null,
    initiatedByName: input.initiatedByName || '',
    // Two separate events: when the number was shown, and when a call was
    // actually placed. A record only exists once the second one has happened.
    revealedAt: input.revealedAt || null,
    initiatedAt: input.initiatedAt || new Date().toISOString(),
    status: 'initiated',
    ringingAt: null,
    connectedAt: null,
    endedAt: null,
    durationSec: 0,
    notConnectedReason: null,
    disposition: null,
    // Filled in when the wrap-up says they ordered. A number the customer read
    // out, not a synced Shopify order — it's a claim to reconcile against the
    // CRM later, so it lives on the call rather than in `orders`.
    orderNumber: '',
    notes: '',
    completedAt: null,
  }
}

// The caller's raw words, kept verbatim forever. Extraction is derived from it
// and never replaces it.
export function makeNoteEntry(input = {}) {
  return {
    id: newId('note'),
    customerId: input.customerId,
    callId: input.callId || null,
    rawText: input.rawText || '',
    appliedFields: input.appliedFields || [],
    createdBy: input.createdBy || null,
    createdByName: input.createdByName || '',
    createdAt: new Date().toISOString(),
  }
}

/**
 * One piece of information about a customer, as it stood at one moment.
 *
 * These are append-only and never edited: asking the same question on a later
 * call produces a second entry beside the first, not a replacement for it. The
 * customer and cat records still carry a single current value for each field —
 * that value is the newest entry, kept flat so a list view doesn't have to
 * walk the history to render a row.
 *
 * `occurredAt` is when the customer said it; `createdAt` is when it was
 * written down. They differ when an agent enters something after the fact, or
 * when a fact is lifted out of a WhatsApp message sent days ago.
 */
export function makeInfoEntry(input = {}) {
  const now = new Date().toISOString()
  return {
    id: newId('info'),
    customerId: input.customerId,
    // Set for anything said about one particular cat, null for the household.
    catId: input.catId || null,

    field: input.field,
    label: input.label || input.field,
    value: typeof input.value === 'string' ? input.value.trim() : input.value,
    // What this replaced as the current value, so a changed dropdown reads as
    // a change rather than as an unexplained second answer.
    previousValue: input.previousValue ?? null,

    source: input.source || 'manual',
    // Whatever names the interaction: our call id, a GoKwik message id, the
    // file a CSV row came from.
    interactionId: input.interactionId || input.callId || null,
    callId: input.callId || null,
    noteId: input.noteId || null,

    occurredAt: input.occurredAt || now,
    createdAt: now,
    createdBy: input.createdBy || null,
    createdByName: input.createdByName || '',
  }
}

export function makeTicket(input = {}) {
  return {
    id: newId('tkt'),
    customerId: input.customerId,
    lastCallId: input.lastCallId,
    status: 'pending',
    scheduledFor: input.scheduledFor,
    attemptCount: 1,
    notes: input.notes || '',
    createdAt: new Date().toISOString(),
  }
}

export const EMPTY_DB = {
  version: SCHEMA_VERSION,
  users: [],
  customers: [],
  cats: [],
  orders: [],
  calls: [],
  noteEntries: [],
  infoEntries: [],
  tickets: [],
}
