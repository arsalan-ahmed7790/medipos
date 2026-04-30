# MediPOS — Pharmacy POS System

A production-ready pharmacy point-of-sale and inventory system. Web-based, fast, and optimised for **80mm / 58mm thermal receipt printing**.

> Live billing · Bulk medicine import · Inventory dashboard · Daily / monthly reports · Receipt customisation

---

## 1. System overview

MediPOS is a single-page web application that runs in any modern browser and connects to a managed cloud database. A pharmacy owner uses it to:

- Maintain a catalog of medicines (name, generic, category, price, cost, stock, expiry, batch).
- Import the catalog in bulk from CSV / Excel.
- Bill customers from an autocomplete-driven cart with live discounts and totals.
- Automatically deduct stock after every sale and prevent over-selling.
- Print a clean thermal receipt on any 80mm / 58mm printer using the system print dialog.
- Review inventory health (low stock, out of stock, expiring soon, total value).
- Run sales reports (daily, monthly, top medicines) and export them to PDF / Excel.
- Customise receipt header, footer, paper width, font size, and visible columns.

### Feature list

| Module | Highlights |
| --- | --- |
| **Billing (POS)** | Autocomplete with stock badges · Per-line and bill-level discounts · Keyboard shortcuts · Live receipt preview · Auto stock deduction |
| **Medicines** | Full CRUD with generic name / batch / expiry · CSV + XLSX import with dedupe · Low-stock filter |
| **Inventory** | KPIs (retail value, cost basis, SKUs) · Out-of-stock & low-stock lists · Expiring-within-60-days table · Quick restock dialog |
| **Reports** | Date-range picker · Daily revenue line chart · Top medicines bar chart · PDF + Excel exports |
| **History** | Searchable invoices · Reprint any past bill |
| **Settings** | Store name / address / phone / footer · 58mm / 80mm paper · Small / Medium / Large font · Show / hide unit price & discount |
| **Receipt** | Monospace grid layout · Long names wrap without breaking columns · `@media print` rules tuned for thermal printers |

---

## 2. Tech stack

- **Frontend** — React 19, TypeScript, [TanStack Start](https://tanstack.com/start) (Vite-powered SSR + file-based router), TanStack Query for data, Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com), [Lucide](https://lucide.dev) icons, [`xlsx`](https://www.npmjs.com/package/xlsx) for spreadsheets, [`jspdf`](https://github.com/parallax/jsPDF) for PDF export.
- **Backend** — Lovable Cloud (managed Supabase): Postgres database with Row-Level Security, auto-generated REST/RPC client, optional edge / server functions.
- **Database** — PostgreSQL 15+ (managed), with one PL/pgSQL function (`decrement_stock`) for safe atomic stock updates.

---

## 3. Installation guide (local development)

### Prerequisites

- **Node.js 20+** and **npm** (or **bun**, both lockfiles are committed).
- A Lovable Cloud project (free) — provides the database URL and publishable key.

### Step-by-step

```bash
# 1. Clone the project
git clone <your-repo-url> medipos
cd medipos

# 2. Install dependencies
npm install
# or: bun install

# 3. Create the env file
cp .env.example .env
# Open .env and fill the three values (see "Environment variables" below).

# 4. Start the dev server
npm run dev
# → http://localhost:5173 (or the next free port)
```

### Environment variables

`.env` — committed automatically when Lovable Cloud is enabled. For a local-only checkout create it manually:

```dotenv
VITE_SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="ey...your-anon-key"
VITE_SUPABASE_PROJECT_ID="YOUR-PROJECT-REF"
```

> The publishable (anon) key is safe to ship in the browser bundle — the database is protected by RLS policies, and there are **no service-role keys** in client code.

### Build for production

```bash
npm run build      # produces .output/
npm run start      # serves the built bundle locally
```

---

## 4. Project structure

```
src/
├── components/
│   ├── AppHeader.tsx              # Top navigation bar
│   ├── medicines/
│   │   └── ImportDialog.tsx       # CSV/XLSX bulk-import workflow
│   ├── pos/
│   │   ├── MedicineAutocomplete.tsx
│   │   └── ReceiptPreview.tsx     # Monospace grid receipt
│   └── ui/                        # shadcn/ui primitives
├── integrations/
│   └── supabase/
│       ├── client.ts              # Browser Supabase client (auto-generated)
│       └── types.ts               # DB types (auto-generated)
├── lib/
│   ├── format.ts                  # Money / number helpers
│   ├── pos.ts                     # Bill totals + receipt text builder
│   ├── print.ts                   # window.print + jsPDF helpers
│   ├── settings.ts                # Settings hook (store_settings table)
│   └── utils.ts                   # cn(), misc utilities
├── routes/
│   ├── __root.tsx                 # HTML shell + providers
│   ├── index.tsx                  # / — Billing (POS)
│   ├── inventory.tsx              # /inventory — KPIs & alerts
│   ├── medicines.tsx              # /medicines — Catalog CRUD + import
│   ├── history.tsx                # /history — Past invoices
│   ├── reports.tsx                # /reports — Charts & exports
│   └── settings.tsx               # /settings — Receipt customisation
├── styles.css                     # Tailwind v4 tokens + thermal-print CSS
├── router.tsx                     # TanStack router bootstrap
└── routeTree.gen.ts               # Auto-generated, do not edit
supabase/
├── config.toml                    # Cloud project ref + function settings
└── migrations/                    # SQL migrations (timestamped)
```

---

## 5. Database schema

### `medicines`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | `gen_random_uuid()` |
| `name` | `text` | Required |
| `generic_name` | `text` | Optional |
| `category` | `text` | Optional (Tablet, Syrup, Injection…) |
| `unit_price` | `numeric` | Selling price |
| `purchase_price` | `numeric` | Cost basis (default 0) |
| `stock` | `integer` | Current units on hand |
| `low_stock_threshold` | `integer` | Default `10` |
| `expiry_date` | `date` | Optional |
| `batch_number` | `text` | Optional |
| `created_at` / `updated_at` | `timestamptz` | |

### `invoices`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `invoice_number` | `text` | e.g. `INV-20260422-093015` |
| `customer_name` | `text` | Optional |
| `subtotal`, `discount_total`, `grand_total` | `numeric` | |
| `items` | `jsonb` | Snapshot of cart at sale time |
| `created_at` | `timestamptz` | |

### `store_settings`

Single-row table (`id = 'default'`) holding store name, address, phone, footer, paper width, font size and the two visibility toggles.

### `decrement_stock(_id uuid, _qty int) → int`

PL/pgSQL `SECURITY DEFINER` function. Subtracts `_qty` from `medicines.stock` only when enough stock exists; returns the new value or `NULL` on insufficient stock. Called from the billing flow after `invoices` insert.

### Multi-pharmacy readiness

To grow into a multi-tenant SaaS later, add `pharmacy_id uuid` to each table, point it at a `pharmacies` table, and replace the `USING (true)` RLS policies with `USING (pharmacy_id = current_setting('app.current_pharmacy')::uuid)` (or `auth.jwt() ->> 'pharmacy_id'`). The application code reads/writes through `supabase.from(...)` so the change is purely in SQL + a small auth layer.

---

## 6. Feature flows

### POS / Billing flow

1. Operator types in the **Medicine** field — autocomplete shows matches with a stock badge.
2. Selecting a suggestion auto-fills price and focuses Quantity.
3. Operator presses **Enter** through Qty → Price → Discount → Add (full keyboard flow).
4. Stock is checked client-side: out-of-stock items are blocked, partial stock shows the available quantity.
5. Optional **Total Discount** (% or flat amount) is applied to the cart-wide subtotal.
6. **Ctrl/Cmd + Enter** opens the receipt preview.
7. The invoice is inserted into `invoices` and `decrement_stock` is called once per medicine.
8. Operator clicks **Print** (system print dialog with `@media print` CSS) or **PDF**.

### Inventory flow

- The `/inventory` page reads the full medicines table once and computes KPIs in memory.
- Out-of-stock and low-stock lists each have a **Restock** button that opens a small dialog adding units atomically.
- Expiry table shows items expiring within 60 days, sorted by urgency (≤14 days marked destructive).

### Bulk import flow

1. Open `/medicines` → **Import CSV / Excel**.
2. Drop a file (`.csv`, `.xlsx`, `.xls`). Headers are normalised — `name`, `medicine`, `product` all map to `name`; `price`, `unit_price`, `mrp`, `rate` all map to `price`; etc.
3. Each row is validated; duplicates against the existing catalog are flagged.
4. Choose **Update existing** or **Skip duplicates**, then confirm.
5. New rows are inserted in one batch, duplicates are updated row-by-row.

---

## 7. Deployment

### One-click (Lovable)

Push to the connected Lovable project and click **Publish**. The site is served from a global CDN with stable URLs:

- `project--{project-id}.lovable.app` — production
- `project--{project-id}-dev.lovable.app` — preview

### Self-hosting

Any host that can run a Node.js / Bun process or serve a Vite SSR build works:

- **Cloudflare Workers / Pages** — `wrangler.jsonc` is already configured.
- **Vercel** — `npm run build` then point Vercel to `.output/`.
- **Docker / VPS** — copy `.output/`, run `node .output/server/index.mjs` behind nginx.

In every environment set the same three `VITE_*` env vars and ensure the database is reachable.

### Thermal printer setup

1. Install the printer driver shipped with the device (most 80mm thermal printers expose a generic Windows / macOS driver).
2. In the OS print settings, set paper size to **80 × 297 mm** (or 58 mm depending on hardware) and **margins = 0**.
3. In MediPOS open `/settings` and set **Paper width** to match.
4. From the receipt dialog click **Print** → choose the thermal printer → **More settings → Margins: None / Scale: 100%**.
5. Save the printer as the default for the receipt dialog so future prints are one-click.

---

## 8. Future improvements

- **Authentication** — add Supabase Auth + per-user roles, then tighten the `USING (true)` RLS policies.
- **Multi-pharmacy** — `pharmacy_id` columns + JWT claim (see schema notes above).
- **Customer management** — promote `customer_name` into a `customers` table with phone, balance, history.
- **Barcode scanning** — wire a USB scanner (acts as keyboard) directly into the medicine autocomplete; for webcam scanning use [`@zxing/browser`](https://github.com/zxing-js/browser).
- **GST / VAT** — add a tax_pct column on `medicines` and a tax line on the receipt.
- **Offline mode** — queue invoices in IndexedDB and sync when the connection returns.
- **Native desktop wrapper** — package the web app with [Tauri](https://tauri.app) for a single-binary install on pharmacy PCs.

---

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Receipt prints with extra page or wrong width | OS print dialog → Margins: None, Scale: 100%, Paper: 80mm. Match `/settings` paper width. |
| "Out of stock" toast on items you just added | Refresh `/medicines` — stock is read once on page load. The cart enforces against the cached value. |
| Bulk import shows "Invalid price" | Ensure the price column is plain numbers (no currency symbol). Header alias for price: `price`, `unit_price`, `rate`, `mrp`. |
| Stock didn't decrement after a sale | Check the toast for "Some stock was not deducted" — happens when the cart name doesn't exactly match a catalog entry, or quantity exceeded current stock. |

---

Built with ❤️ on Lovable Cloud.
