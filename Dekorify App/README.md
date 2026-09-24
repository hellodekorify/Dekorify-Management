# Dekorify Finance

Accounting and financial management for a Shopify ecommerce business. Sales, expenses,
COGS, advertising spend, profit and cash flow in one place — built to answer one
question at a glance:

> **How much money did my business actually make this month?**

---

## Running it

You need [Node.js 20 or newer](https://nodejs.org). Everything else installs itself.

```bash
npm install
```

```bash
npm run setup
```

`setup` generates the database client, creates the database, and loads eight months of
realistic demo data so you can look around immediately.

```bash
npm run dev
```

Open <http://localhost:3000> and sign in with:

| | |
|---|---|
| **Email** | `hellodekorify@gmail.com` |
| **Password** | `Dekorify2026` |

To start from an empty book instead, delete `prisma/dev.db`, run `npm run db:push`, and
create your own account at `/signup`.

### Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run db:seed` | Reload the finance demo data |
| `npm run db:seed:orders` | Reload the order tracking demo data |
| `npm run db:reset` | Wipe everything and reseed |
| `npm run typecheck` | Type-check without building |

---

## What it does

**Dashboard** — Revenue, COGS, gross profit, ad spend, operating expenses and net profit,
with the full arithmetic shown as one readable chain. Filter by today, this week, this
month, last month, this year or any custom range. Every figure is compared against the
previous period of the same length.

**Sales** — One row per order with discounts, refunds, shipping income and processing
fees. Net revenue is calculated, never typed. Cancelled and returned orders are kept for
the record but earn nothing.

**Expenses** — Full CRUD with categories, payment methods, vendors, receipt attachments
and notes. Categories are yours to create, rename, recolour, reorder and delete.

**Recurring expenses** — Rent, salaries, subscriptions. The app tells you what has fallen
due and posts the entries when you say so, rather than writing financial records behind
your back.

**COGS** — Quantity × unit cost, computed server-side. Tracked by product, SKU, supplier
and month, with COGS as a percentage of revenue.

**Ads spend** — Meta, Google, TikTok, Amazon, Snapchat. ROAS, TACOS, cost per click and
cost per conversion, plus spend by platform and by campaign.

**Import** — Upload `.xlsx`, `.xls` or `.csv`. Columns are matched automatically, every
row is validated, duplicates are detected both within the file and against what you
already have, and nothing is written until you confirm. See below.

**Profit & loss** — Month-by-month or a single total, from gross sales down to net
profit. Every subtotal can be checked by adding up the lines above it.

**Cash flow** — Opening balance, money in, money out, closing balance. The opening
balance is calculated from your account openings plus every prior movement, so it can
never drift out of step with the transactions.

**Products & suppliers** — Catalogue with profit per unit and margin; vendors with
purchase history, payments and outstanding balance.

**Orders & delivery tracking** — Every Shopify order from placement to delivery, return
or cancellation. Status dashboard, searchable order table, per-order timeline, delivery
attempts, and a Delivery Issues board for orders that need a human. See below.

**Reports** — Monthly summary, P&L, revenue, expenses, COGS, advertising, product
profitability, cash flow, delivery performance, courier performance and problem orders.
All filterable and exportable to Excel, CSV or PDF.

---

## How the numbers work

These are the decisions behind every figure. They are worth knowing, because they are
what make the totals trustworthy.

### Money is never a floating-point number

Every amount is stored as a `BigInt` of **minor units** — paisa for PKR, cents for USD.
`150000` means 1,500.00. All arithmetic happens on these integers; conversion to a
decimal happens only when a figure is displayed. There is no rounding drift, and no
`0.1 + 0.2` surprises in a profit total.

Percentages and pro-rata splits use integer `mulDiv` with half-away-from-zero rounding,
and allocation is written so a split never loses or invents a paisa.

### Revenue recognition

A cancelled order never produced money. A returned order gave the money back. Neither
counts as revenue. This rule lives in one place and is used by the dashboard, the P&L and
every report, so they can never disagree with each other.

```
Net revenue = gross sales − discounts − refunds + shipping income
```

### Where the profit line sits

```
Net revenue
  − product cost (COGS)
  − fulfilment & delivery costs
  − payment processing fees
= GROSS PROFIT
  − advertising
  − operating expenses
= NET PROFIT
  − zakat, drawings and tax
= PROFIT AFTER APPROPRIATIONS
```

Whether a cost sits above or below the gross profit line is decided by its **category
kind**, which you control:

- **Fulfilment & delivery** — a direct cost of getting the order to the customer. Above
  the line, alongside COGS.
- **Operating expense** — a running cost of the business. Below the line.
- **Other** — appropriations such as zakat or owner drawings. Shown separately, below net
  profit, because they are a distribution of profit rather than a cost of earning it.

Move a category between kinds and the statement re-splits accordingly. Shipping and
payment fees default to fulfilment; if you would rather treat them as overheads, change
the category and the P&L follows.

### Multi-currency

Each transaction stores its **original amount**, its **currency**, the **exchange rate**
(as an integer scaled by 1e8) and the **converted amount** in your reporting currency.
Reports sum the pre-converted integers, so a figure never changes because a rate moved
after the fact.

### Current periods stop at today

"This month" means the 1st to today, not the 1st to the 31st. A report should not show
four empty future months and imply the business went quiet.

---

## Importing spreadsheets

1. **Upload** — `.xlsx`, `.xls` or `.csv`, up to 20 MB. Title rows and blank lines above
   the real table are skipped automatically; the header row is found by looking for the
   first row with real columns and data beneath it.
2. **Choose what it is** — guessed from the column headings, changeable if the guess is
   wrong. Multi-sheet workbooks let you pick the sheet.
3. **Map columns** — matched automatically against the header spellings used by Shopify,
   Meta and typical bank exports. Every field shows a sample value from your file so you
   can see the mapping is right.
4. **Check** — every row is validated. You will see unreadable dates, non-numeric
   amounts, missing required fields, rows repeated inside the file, and rows that already
   exist in your data. Duplicates are skipped by default.
5. **Import** — runs as a single database transaction. If anything fails part-way, the
   whole import is rolled back and your books are untouched.

The original file is kept under `storage/` and listed under Recent imports, so any figure
can be traced back to the spreadsheet it came from.

Amounts are parsed generously: `45,000`, `1.234,56`, `PKR 78,900`, `Rs. 4,500.50` and
`(1,200)` for a negative all work. Dates accept ISO, `15/03/2026`, `03/15/2026` and Excel
serial numbers.

---

## Order tracking & delivery management

Answers one question on sight: **where is this order right now?**

### How an order flows

```
Shopify order
  ↓  synced or pushed by webhook
Order in the app                    NEW
  ↓  you confirm it                 CONFIRMED → READY_TO_SHIP
  ↓  "Book with Leopards"           SHIPMENT_CREATED   (CN number issued)
  ↓  courier collects               PICKED_UP
  ↓  polled every few minutes       IN_TRANSIT → OUT_FOR_DELIVERY
  ↓                                 DELIVERED
                                or  CUSTOMER_NOT_HOME → RESCHEDULED → DELIVERED
                                or  DELIVERY_FAILED → RETURN_IN_TRANSIT → RETURNED
```

### Two rules the module is built on

**Tracking events are append-only.** A re-sync never rewrites history. Every event
carries a fingerprint of its courier status, timestamp and location, and a unique index
on that fingerprint is what makes re-polling safe — the same event arriving twice is
recorded once.

**Everything else is derived.** A shipment's status, its current location, its delivery
attempt count and the parent order's status are all recomputed from the event log rather
than written independently, so they cannot drift out of step with the evidence.

### Courier wording is never thrown away

Leopards' own status text is stored on every event alongside the internal status it
mapped to, and both are shown on the timeline. The mapping is configurable in
**Settings → Couriers** — couriers reword statuses without warning, and a mapping you can
fix beats one only a developer can.

An unrecognised status is still recorded and still visible; it simply does not move the
order, and the sync log names it so you can add a mapping.

### Delivery attempts

Counted automatically from the events the mapping marks as an attempt. Whether a status
counts is stored *on the event* at the time it was recorded, so editing the mapping today
never silently rewrites last month's attempt counts.

### Manual overrides

You can set a status, add a CN number, record an attempt or write a note by hand. Each
one is recorded as a `MANUAL` event attributed to you and sits in the timeline beside the
courier's events. The courier's history is never deleted or overwritten.

### The link back to Sales

`Sales` is the finance record; `Orders` is the operational one. They are linked, and the
link matters in one direction especially: **when the courier reports a return, the sale
is marked returned** so the profit & loss statement stops counting it as revenue.
Without that, a returned parcel would inflate your profit forever.

| Order status | Sale becomes | Effect on the P&L |
|---|---|---|
| Delivered | `FULFILLED` | Counts as revenue |
| In transit / out for delivery | `IN_TRANSIT` | Counts as revenue |
| Returned, refused, return in transit | `RETURNED` | Excluded from revenue |
| Cancelled | `CANCELLED` | Excluded from revenue |
| Failed attempt, customer not home | *unchanged* | Still counts — the parcel may yet land |

---

## Connecting Leopards Courier

1. Ask your Leopards account manager for an **API key and password**, and the **city ID**
   for the city you ship from.
2. Put them in `.env` as `LEOPARDS_API_KEY` and `LEOPARDS_API_PASSWORD`, or enter them in
   **Settings → Couriers**. Environment variables always win.
3. Set the origin city ID and return address on the same page.
4. Map each destination city to its Leopards numeric ID — booking is refused for an
   unmapped city rather than sent with a wrong one.
5. Press **Test connection**.

The integration uses Leopards' published endpoints:

| Purpose | Endpoint |
|---|---|
| Book a shipment | `POST /webservice/bookPacket/format/json/` |
| Track shipments | `POST /webservice/trackBookedPacket/format/json/` |
| Cancel a booking | `POST /webservice/cancelBookedPackets/format/json` |
| City list | `POST /webservice/getAllCities/format/json/` |

Base URL is `https://merchantapi.leopardscourier.com` in production and
`http://new.leopardscod.com` in staging. Authentication is `api_key` + `api_password` in
the request body — Leopards has no header auth and no OAuth.

Leopards does not publish its *response* shapes, so responses are read defensively: the
parser accepts the field spellings Leopards is known to use and falls through
alternatives, and every raw response is kept on the sync log. If your account returns
something unexpected, **Settings → Couriers → Recent courier activity** shows the actual
payload.

Leopards has no tracking webhook, so shipments are polled. Only shipments that can still
move are polled — a delivered or returned parcel is never asked about again.

---

## Automatic synchronisation

`POST /api/cron/sync` runs Shopify order import and Leopards tracking for every connected
store. It authenticates with a shared secret, not a user session.

```bash
curl -X POST http://localhost:3000/api/cron/sync -H "Authorization: Bearer YOUR_CRON_SECRET"
```

- `?tracking=only` — skip the Shopify pull, just refresh tracking
- `?limit=300` — cap how many shipments are checked in one run

Returns `200` when everything ran, `207` when something could not — including a plain
message saying why, so a scheduler's own alerting can catch a sync that has quietly
stopped working.

A sensible pairing is tracking every 15 minutes and a full sync hourly. On Windows, use
Task Scheduler with the `curl` command above.

---

## Connecting Shopify

The integration is built and ready; it needs credentials from you.

1. Create an app at [partners.shopify.com](https://partners.shopify.com).
2. Add the redirect URL `http://localhost:3000/api/shopify/callback` to the app.
3. Put the credentials in `.env`:

   ```
   SHOPIFY_API_KEY="your key"
   SHOPIFY_API_SECRET="your secret"
   SHOPIFY_APP_URL="http://localhost:3000"
   ```

4. Restart the app, go to **Settings → Shopify**, enter your store domain and connect.

### Scopes

```
read_orders, read_all_orders, read_fulfillments,
read_products, read_customers, read_inventory
```

`read_fulfillments` is what lets the tracking module pick up a CN number attached in
Shopify. `read_all_orders` is needed to reach orders older than 60 days and must be
requested from Shopify for a public app.

### Webhooks

Registered automatically when you connect, pointing at
`{SHOPIFY_APP_URL}/api/shopify/webhooks`:

`orders/create` · `orders/updated` · `orders/cancelled` · `orders/fulfilled` ·
`fulfillments/create` · `fulfillments/update`

Shopify has to be able to reach that URL, so on `localhost` registration will fail —
that is expected and does not block the connection. Use a tunnel (ngrok, Cloudflare
Tunnel) and set `SHOPIFY_APP_URL` to the public address to enable them. Without webhooks
everything still works; orders just arrive on the next scheduled sync instead of within
seconds.

Every webhook is HMAC-verified before its body is read, and matched to a connected store
before anything is written.

### What the sync does

- Matches orders on their Shopify reference, so syncing twice **updates** rather than
  doubling your revenue.
- Imports cancelled and returned orders for the record, at zero revenue.
- Fetches only orders since the last sync, with a few days of overlap so a late edit is
  not missed. The first sync reaches back a year.
- Never overwrites a product cost you entered yourself with a Shopify blank.
- Writes both the finance record (**Sales**) and the operational record (**Orders**),
  linked to each other.

Credentials are read from the environment and never stored in the database. Only the
per-store access token Shopify issues is saved. Every OAuth callback is verified by HMAC
signature and a session-bound nonce before a token is requested.

---

## Data integrity

- **Append-only tracking history** — a courier event is never updated or deleted once
  recorded, and a unique fingerprint per event makes re-syncing idempotent.
- **Soft deletes** — financial records are marked deleted, not erased, and can be
  recovered.
- **Audit log** — every create, update, delete and import is recorded with a before and
  after snapshot. Visible under **Settings → Activity log**.
- **Confirmation before deleting** anything financial, with the amount shown so you know
  what you are removing.
- **Duplicate prevention** — order references must be unique; SKUs must be unique;
  imports detect repeats on a natural key per record type.
- **Transactional imports** — all or nothing.
- **Server-side validation** on every mutation. Nothing trusts the browser.
- **Derived figures are never typed** — net revenue, total cost and gross profit are
  always computed from their inputs.

---

## Security

- Passwords hashed with bcrypt (12 rounds).
- Sessions are random 256-bit tokens in an `httpOnly`, `sameSite=lax` cookie; the
  database stores only a SHA-256 hash, so a leaked database cannot be replayed as a live
  session.
- Password reset tokens are single-use, hashed at rest, and expire after an hour.
  Changing a password ends every other session.
- Sign-in never reveals whether an email is registered.
- Every query is scoped by store membership, so a forged cookie cannot reach another
  account's data.
- Uploaded files are stored under generated names; the original filename is kept in the
  database for display only, so a crafted name cannot escape the storage directory.
  Reads are path-checked against the storage root.
- CSV exports escape cells beginning with `=`, `+`, `-` or `@` so a spreadsheet cannot be
  tricked into executing them.

---

## Moving to PostgreSQL

Development uses SQLite so the app runs with no database to install. Switching is two
lines:

1. In `prisma/schema.prisma`, change the datasource provider:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. In `.env`, point `DATABASE_URL` at your server:

   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/dekorify"
   ```

Then `npm run db:push`. No application code changes: the schema deliberately avoids
database-specific types, and money is stored as integers, which behave identically on
both engines.

Before deploying, set a real `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Project layout

```
prisma/
  schema.prisma          Database schema, with the money conventions documented
  seed.ts                Eight months of realistic demo data
src/
  app/
    (auth)/              Sign in, sign up, password reset
    (app)/               The application, behind the sidebar shell
      orders/            Order tracking, detail pages, delivery issues
    actions/             Server actions — auth, validation, mutations
    api/
      shopify/           OAuth install, callback, webhook receiver
      cron/sync          Scheduled Shopify + tracking synchronisation
      receipts/          Expense receipt downloads
  components/
    ui/                  Buttons, fields, tables, modals, toasts
    charts/              Recharts wrappers with shared formatting
    filters/             Date range, search, category and amount filters
  lib/
    money.ts             Integer money arithmetic — the foundation
    finance.ts           Every calculation the app displays
    reports.ts           Report definitions and builders
    import/              Spreadsheet parsing, mapping, validation, execution
    shopify/             OAuth, API client, order sync, webhooks
    orders/              Lifecycle statuses, tracking engine, read models
    leopards/            Courier API client, status mapping, booking, polling
storage/                 Uploaded receipts and original import files
```

The rule of thumb: **actions** handle authentication and validation, **lib** does the
work, **components** display it. Nothing in `lib` knows about HTTP, which is what makes
the calculations straightforward to check.

---

## Built with

Next.js 15 (App Router) · React 19 · TypeScript · Prisma · SQLite (PostgreSQL-ready) ·
Tailwind CSS v4 · Recharts · SheetJS · jsPDF
