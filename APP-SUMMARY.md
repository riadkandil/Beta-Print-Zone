# Print Zone — App Summary

Transaction recorder for a print shop: printing, photocopying, scanning, engineering plans, stationery and other services. Staff record orders fast; the admin sees money, costs and trends.

Print Zone **v3.2** is the main app. The classic app is still online as a fallback; both share **one Firebase database**, so anything recorded in one shows up in the other. v3.2 adds fields the classic app does not understand (part-payments), so the classic app shows a part-paid order as fully owed; retiring it is the next step (see section 10). Where each version lives:

| Version | Path | Status |
|---|---|---|
| Print Zone (main) | `/` | v3.2 |
| Classic (fallback) | `/classic/` | v1.12 |
| Old beta links | `/beta/` | Redirect to `/` |
| Demo | `/demo/` | v3.2 with sample data, never touches the shop's database |

---

## 1. Hosting

| Where | URL | What runs there |
|---|---|---|
| Netlify (repo `riadkandil/Print-Zone`, branch `main`) | https://elmohandes-print-zone.netlify.app/ | Print Zone v3.0 (+ `/classic/`) |
| GitHub Pages (repo `riadkandil/Beta-Print-Zone`) | https://riadkandil.github.io/Beta-Print-Zone/ | Print Zone v3.0 (+ `/classic/`) |
| Local working copy | `R:\Office\Print-Zone` | Same as `main` |

---

## 2. Tech stack

- **Plain HTML + CSS + JavaScript**: no framework and no build step. Edit a file, refresh, done.
- **Firebase 10.12.2 (compat SDK)**:
  - Firestore holds the data.
  - Anonymous sign-in connects the browser.
  - The offline cache (`enablePersistence`) keeps the app working without internet and syncs later.
- **Local mode**: if Firebase is not configured, data is kept in the browser's `localStorage` on that device only.
- **Libraries from CDN**: Lucide 0.378.0 (icons), SheetJS 0.18.5 (Excel export), Google Fonts Roboto (Latin text) and Cairo (Arabic text).

### File structure

```
index.html          all screens (login, POS, history, unpaid, costs, machines, dashboard, settings, dialogs)
css/app.css         full design system (tokens, themes, layout, components, charts)
js/core.js          config, helpers, translations (EN/AR), service list, money and client-name rules, data store, dialogs, navigation, theme
js/pos.js           recording screen: tiles, price dialog, order panel, save / edit orders
js/lists.js         History, Unpaid, Costs, Machines pages
js/dash.js          admin dashboard: KPIs, insights, charts
js/settings.js      export, backup, passwords, machine list, themes
js/boot.js          login and startup
tests/money.html    automated money tests (runs only on a local copy without Firebase)
logo-mono.png       line-art logo (drawn through a CSS mask in the app's colours)
logo-icon.png       blue browser-tab icon
Logo.png            original colour logo (used by the classic app)
classic/            the classic app v1.12 (index.html, css/styles.css, js/app.js)
beta/index.html     redirect for old /beta/ links
```

---

## 3. Roles and login

- **Employee**: records orders, sees History, Unpaid, Costs and Machines.
- **Admin**: everything an employee can do, plus Dashboard and Settings. Only the admin can edit or delete saved orders and merge client names.
- **Security note**: the roles are enforced **in the browser only**. Anyone with the link and some technical skill could act as admin or change data directly, because the database accepts any signed-in (anonymous) device. The change log protects against honest mistakes, not against tampering. Staff are trusted for now; real protection needs Firebase Authentication with per-user accounts and Firestore security rules.
- **Passwords**:
  - Stored as SHA-256 hashes in `settings/config`.
  - The admin changes them in Settings.
- **Session**:
  - Kept in `sessionStorage` (`pz_session`).
  - Shared with the classic app, so signing in once covers both versions.

---

## 4. Design system (v3.0)

Based on a **"Google Drive dashboard" design shot**, stretched to the full window like a normal website on a plain background: a header across the top, a blue left sidebar with a curved top corner, folder-shaped cards and an airy file table.

**Logo**: `logo-mono.png`, a minimal line-art version of the helmet logo with no box or border, painted in the app's colours (title blue; light blue in dark mode). It faces into the page: as drawn in Arabic, mirrored in English. `logo-icon.png` is a blue copy used as the beta's browser-tab icon.

### Colours

Colours were measured from the design image.

| Token | Light | Dark | Used for |
|---|---|---|---|
| Brand blue | `#2363c7` | `#3b7be0` | Backdrop, sidebar, selected cards, main buttons |
| Card / surface | `#ffffff` | `#131c2e` | The app card, panels, dialogs |
| Soft fill | `#f0f2f8` | `#1b2640` | Inputs, chips, login cards |
| Hover tint | `#e5eefd` | `#1e3360` | Hovered rows, icon tiles |
| Row line | `#eef0f5` | `#1f2a40` | Table and list separators |
| Title blue | `#1d4ea3` | `#8db7ff` | Page titles, names, totals |
| Section title | `#383b42` | `#c9d2e3` | Small uppercase headings |
| Text / muted | `#2f3a4f` / `#8a93a6` | `#dde5f4` / `#8693ad` | Body text, captions and dates |

### Shapes and type

- **Sidebar**: brand blue, 48px curve on its top inner corner, white text; the active page shows in pale blue (`#a6cdff`).
- **Folder cards**: cards with a tab on the top edge that slopes down. Used for service tiles, the login role cards and the dashboard's headline figure.
  - **Service cards** each have their own soft tint (blue A4, violet A3, teal A5, clay engineering, green stationery card, indigo lamination, sky upload, rose office supplies, grey other). The open service takes a deeper shade of its own tint.
  - Login cards are soft grey; the selected one turns solid blue.
- **Buttons**: pill-shaped; main buttons are brand blue, secondary ones soft grey.
- **Inputs**: soft-grey fill, 10px corners, blue ring on focus.
- **Section titles**: small, bold, uppercase with wide letter-spacing (English only, so Arabic letters stay joined).
- **Fonts**: Roboto for Latin, Cairo for Arabic. **Icons**: Lucide line icons.

### Layout

- **Header** across the full width, with a thin line under it:
  - Logo (no box) and **Print Zone** (same width as the sidebar). Clicking the logo goes back to **New order**.
  - No search bar. History keeps its own search box above the list.
  - Bell (unpaid count, opens Unpaid), language (**EN** / **AR**), light/dark.
  - Role name + round blue avatar with a coloured dot for the connection state. The avatar opens a menu: role, version, connection, classic version, sign out.
  - Phones only: a menu icon at the start of the header opens the sidebar drawer.
- **Left sidebar**:
  - **Collapse button at the top of the sidebar**, on its leading side (left in English, right in Arabic).
  - Pages: New order, History, Unpaid, Costs, Machines, Dashboard and Settings (the last two for the admin only). The logo also goes to New order.
  - Compact enough to show everything without scrolling; on very short windows the "Today" box hides.
  - **"Today" box** at the bottom: today's orders with a bar against yesterday, then a "Classic version ↗" link.
  - **Collapses to icons only**; the choice is remembered (`pz_beta_nav`).
  - On screens narrower than 900px it becomes a **slide-out drawer**.
- **Page title row**: big blue title + a small blue square with the page icon, the date and time on the far side (on New order, the **Total price** switch sits beside it), and a thin line under it.
- **Recording screen**: service cards on one side and the order panel (checkout) on the other. On screens 1000px and wider **the whole page fits the window with no scrolling** (checked at 1280×720, 1366×768 and 1920×1080); only a long list of order lines scrolls inside the panel. Stacked on phones.
- **Phones**: the page scrolls normally and the sidebar is a drawer.
- **Bilingual**: Arabic (RTL, default) and English (LTR). The layout mirrors automatically, including the folder tabs and the sidebar curve.
- **Light / dark**:
  - Light is the default; the choice is saved in `pz_beta_theme`, separate from the classic app's.
  - Both modes come in **six shades of blue**, picked in Settings → Themes and saved per device:
    - Light (`pz_beta_light`): Classic (default), Sky, Ocean, Navy, Steel, Indigo.
    - Dark (`pz_beta_dark`): Midnight (default), Navy, Ocean, Steel, Royal, Abyss.
  - Picking a shade also switches to its mode; the moon/sun button flips between the two chosen shades. Service cards keep their own tints in every theme.

### Chart colours

Validated for colour-blind safety in both themes:

| Slot | Light | Dark |
|---|---|---|
| 1 (blue) | `#2a78d6` | `#3987e5` |
| 2 (orange) | `#eb6834` | `#d95926` |
| 3 (aqua) | `#1baf7a` | `#199e70` |
| 4 (yellow) | `#eda100` | `#c98500` |

---

## 5. Recording orders (POS)

### Service tiles

Eleven services in three groups on one screen, no tabs:

| Service | Category | Tile |
|---|---|---|
| A4, A3, A5 | Printing | Folder card, drawn as a paper sheet in real proportions + **Print / Copy / Scan** buttons |
| Engineering | Printing | Folder card with a compass icon + **Print / Copy / Scan** buttons |
| Contract (عقد), Power of Attorney (توكيل), Writing (كتابة) | Writing Category (قسم الكتابة) | **One card** with the three items as stacked rows, so full names fit |
| Lamination, Electronic upload, Office supplies, Other service (always last) | Services | Small cards in a 2 × 2 grid, beside the Writing Category card |

- A tile shows a small count badge when that service is already in the current order.
- Cards show only artwork/icon and name; the open service takes a deeper shade of its tint.
- Long names wrap to a second line instead of being cut off.
- The old Stationery (books) and Pads cards are gone; saved orders that used them still show their names. Office supplies came back in v3.1 under Services (it still counts in the Writing Category on the dashboard). v3.2 renamed the category from "Stationery / أدوات" to "Writing Category / قسم الكتابة". The Settings "Product lists" panel stays hidden; past entries are still suggested.

### Price dialog (fast entry)

- Tapping a tile or one of its Print/Copy/Scan buttons opens the dialog with the **cursor already in the price box**.
- **The last price used** for the same item is filled in and selected, so typing replaces it.
- **Options**:
  - A4/A3/A5 print and copy: Black/Color, One/Two sides, Normal/Glossy.
  - Scans (A-sizes and engineering): price only, no quantity.
  - **Engineering print and copy: price first, then an optional quantity** (empty counts as 1; the total is price × quantity). No length and no colour.
  - Contract, Power of Attorney, Writing: price + optional quantity, nothing else.
  - Lamination / Electronic upload: optional note + quantity + price. Office supplies: optional product name (suggested from past entries) + quantity + price. Other service: its name (required) + quantity + price.
  - **Pricing**: one **Total price** switch beside the date on the New order page. Off = the price is per piece; on = the price is the total for all pieces. It is remembered on the device (`pz_beta_total`); editing a saved line keeps that line's own pricing.
- **Keyboard**:
  - Enter walks from price to quantity to name, then adds the item.
  - Ctrl+Enter adds the item and places the order.
  - Esc closes the dialog.
- **Two buttons**: **Add** (back to the tiles for the next item) and **Add & place order** (adds and saves in one step).
- On phones the dialog is a bottom sheet; on wide screens it is a centred dialog.

### Order panel (checkout)

- **Header**: "Current order · Order #N today".
- **Client name**: optional for paid orders (it defaults to "Client"), **required when the payment is Not paid**. The field says so as soon as Not paid is picked, and saving is blocked with a red outline until a name is typed. Past names are suggested, one spelling per client.
- **Date** follows today unless changed.
- **Lines**: service icon, title, details, quantity stepper, line total, remove. Tap a line to edit it.
- **Totals**: number of items and grand total.
- **Payment**: Cash, InstaPay, Vodafone Cash, Not paid, Other (free text).
- **Optional note**.
- **Place order** button. On phones a floating save bar appears when the button is off screen.
- **Undo** after removing a line or clearing the order.
- **Admin edit**: open a saved order from History or Unpaid; it loads into the panel with a yellow "Editing" banner and the button becomes "Update order". Everything can be changed: items, prices, quantities, client, **date and time**, note and payment. Saving returns to the page the edit started from.
  - Every edit adds an entry to the order's **change log**: who, when, and old → new for total, client, date, time, payment, note and items.
  - A total below what was already paid is refused.
  - Switching an unpaid order to a paid method settles it (earlier part-payments are kept); switching a paid order back to Not paid makes the whole total owed again.

---

## 6. Other pages

| Page | Who | What it does |
|---|---|---|
| **History** | All | Orders grouped by day with daily totals. Search, Today / Week / Month / All, filter by Unpaid (orders that still owe) or Mistake. Open an order to see its items, **payments** and **change log**. Actions: record payment, mark/unmark as mistake (logged; an order that still owes warns that the debt will be removed), edit and delete (admin). |
| **Unpaid** | All | **By client** (default) or **By order**. A summary shows the total outstanding, the number of clients and orders. Each client shows what they owe, how many orders, the oldest debt's age and what was already paid; it opens to their orders, oldest first. **Record payment** (on a client or an order) takes an amount and a method: it pays the oldest debts first and the rest stays owed. The admin can also date the payment, edit an order, and **merge names** (two spellings of one client; undoable). Search by client name. |
| **Costs** | All | Record expenses: Repair, Internet, Electricity, Salaries, Inventory, Other (custom name). Amount, date, note. List with ranges and totals. |
| **Machines** | All | Enter each printer's counter reading; shows the difference since the last reading and the last 5 readings. |
| **Dashboard** | Admin | See section 7. |
| **Settings** | Admin | Excel (.xlsx) and CSV export by date range (optionally including mistakes): each order gets Order total, Status (Paid / Part-paid / Unpaid), Paid, Owed and Paid on, and the summary shows Sales, Collected, Still owed, Costs and Net. JSON backup download (**all** orders, also those older than the live window) and restore (keeps existing records). Change employee and admin passwords; edit the machine list; about / version. |

---

## 7. Dashboard (admin)

One period filter controls everything on the page. The options are Today, Yesterday, Last 7 days, This month, Last month, This year, or a picked day. There is **no hour-based analysis** (v3.2 removed it).

**Money definitions (v3.2)**:

| Figure | Meaning |
|---|---|
| **Sales** | Orders, counted on the order's date (paid or not) |
| **Collected** | Money received, counted on the day it came in: on the order's date when paid on the spot, on the day it was marked paid, and each part-payment on its own date |
| **Outstanding** | What clients owe right now, whatever the period |
| **Net** | Collected − Costs |

- **KPI cards**: Sales (large card with a trend line and the change versus the previous period), Collected, Outstanding now, Costs, Net, Orders, Average order. Changes are shown as ↑/↓ with a percentage; green or red depends on whether up is good (for costs, up is bad).
- **Insights**: best day, top service and its share of sales, money collected from earlier orders, what this period's orders still owe, printed pieces, and unpaid orders across all time.
- **Daily report** (table): one row per day (per month for ranges over two months) with orders, sales, collected split into Cash / InstaPay / Vodafone Cash / Other, costs and net, plus a total line. Its totals equal the KPI cards. **Excel** button exports it.
- **Sales by service, in detail** (expandable table): category › service › operation (Print / Copy / Scan, or the item's name for writing items, office supplies and other services) › options (colour · sides · glossy). Every row shows jobs, printed pieces, sales and share of the period's sales, with a bar in its category's colour. Categories start open; **Expand all / Collapse all** and an **Excel** export (one line per most detailed item). Names typed differently (case, spaces, Arabic letter forms) count as one item.
- **Charts**:
  - Sales and collected by day (a single day shows the 14 days up to it, with the day marked; by month for long ranges).
  - Sales by category: Printing / Engineering / Writing Category / Services, shown as one share bar.
  - Top services by sales.
  - Collected by payment method.
  - Costs by type.
- **Every chart** has hover/focus tooltips and a **Table** button that shows the same numbers as a table.
- Orders marked as mistakes are excluded from all numbers.
- Ranges older than the live window (see 8) are fetched when picked, with a short "Loading older records…" note.

---

## 8. Data model

### Firestore collections

| Collection / doc | Content |
|---|---|
| `transactions` | One document per order |
| `expenses` | One document per cost |
| `machines` | Printer list with counter readings |
| `settings/config` | Password hashes |
| `settings/catalog` | Product names (old lists) and `clientAliases` (merged client names) |

### Order (transaction)

`client, date, notes, payMethod, payOther, items[], total, pieces, engMeters, createdAt, createdBy, deviceId`, plus optional `mistake, editedAt, editedBy, paidAt`, and since v3.2:

- `payments: [{ amount, method, other, date, at, by }]`: part-payments. An order stays `payMethod: 'notpaid'` until fully paid; the payment that settles it sets `payMethod` to its own method and `paidAt`, so older readers still see a paid order.
- `edits: [{ at, by, kind: 'edit', changes: { field: { from, to } } }]` or `{ at, by, kind: 'mistake' | 'unmistake' }`: the change log.

**Loading (online)**: the app keeps three live lists merged by id, with no cap: orders from the last 100 days, every unpaid order, and every order settled in those 100 days. Older orders are fetched once, in pages, when a dashboard range, History "All", an export or a backup needs them. (v3.1 loaded only the newest 5,000 orders, so old orders and old debts could silently disappear.)

**Client names** are matched ignoring extra spaces, upper/lower case, Arabic letter forms (أ إ آ → ا, ى → ي, ة → ه), diacritics and Arabic digits. Merged names live in `settings/catalog.clientAliases` as `{ nameKey: targetName }`; nothing in the orders is rewritten.

### Item

`type (paper | simple | custom), svc, op (print | copy | scan), color, face, finish, desc, qty, price, total, engLength, engNote, engPerMeter, noQty, isFinal`

- `noQty: true` for scans (and for engineering items saved before v2.4); these don't count towards printed pieces. Engineering print/copy now saves its quantity (1 when left empty).
- `isFinal: true` means the price is the total for all pieces.
- New engineering items store `engLength: null`. Older per-meter items still carry their length and per-meter price.

### Expense

`type, otherLabel, amount, date, note, createdAt`

### Browser storage keys

| Key | Purpose |
|---|---|
| `pz_session` (session) | Signed-in role, shared with the classic app |
| `pz_lang` | Language (shared) |
| `pz_beta_theme` | Light or dark (key names keep the old `pz_beta_` prefix so saved choices carry over) |
| `pz_beta_nav` | Sidebar collapsed or open |
| `pz_beta_light` | Which blue light theme |
| `pz_beta_dark` | Which blue dark theme |
| `pz_beta_total` | Total price switch on or off |
| `pz_device` | Device id stamped on orders |
| `pz_tx`, `pz_exp`, `pz_mc`, `pz_settings`, `pz_catalog` | Data in local mode only |

---

## 9. Change log

- **Classic v1.12**:
  - No quantity for scans and engineering.
  - Remembered prices, Enter to add, Ctrl+Enter to save.
  - Mistakes excluded from the dashboard.
- **Beta v2.0**: new app at `/beta/` on the same database.
  - Quick picks, item builder, cart.
  - Offline-aware saving.
  - New dashboard with tables for every chart.
- **Beta v2.1**: POS-style redesign.
  - Dark navy theme and top-bar navigation.
  - Big gradient service tiles; quick adds removed; price always focused.
  - Richer dashboard: insights, category mix, busy-times heatmap, top clients, This year, 12 months.
- **Beta v2.2**: rea.tools design.
  - Light-first with Catppuccin dark.
  - Professional header and collapsible left sidebar.
  - Print/Copy/Scan buttons on the tiles.
  - Engineering is price only.
  - One-step "Add & place order".
  - Price entry in a dialog/sheet.
- **Beta v2.3**: "Google Drive dashboard" design.
  - Blue backdrop with the app as a white rounded card.
  - Blue sidebar with a curved corner, "New order" button and a "Today" box.
  - Pill search in the header (services, or orders on History), bell for unpaid orders, avatar menu.
  - Folder-shaped service cards, login cards and dashboard headline.
  - History and Unpaid shown as an airy file-style table.
- **Beta v2.4**:
  - Minimal black-and-white logo with no box, everywhere in the beta.
  - Sidebar collapse button moved to the top of the sidebar; header search, "New order" button, "New" link and the sidebar sales figure removed.
  - Muted, low-saturation colour for each service card.
  - Language button shows "AR" instead of "ع".
  - Engineering print and copy get an optional quantity again.
- **Beta v2.5**:
  - Full-window layout on a plain background (no blue backdrop, no card inside the page); New order fits the screen without scrolling; compact sidebar.
  - "New order" link back in the sidebar.
  - Logo in the app's colours, mirrored in English; blue browser-tab icon.
  - Six blue dark themes in Settings.
  - Stronger tint on the service cards; Stationery is now Contract / Power of Attorney / Writing as small cards.
  - Category tabs removed: Printing, Stationery and Services show together.
  - "Total price" switch replaces the per-item checkbox.
- **Beta v2.6**: six blue light themes next to the dark ones (Settings → Themes); glows and focus rings follow the chosen blue.
- **v3.0**: the beta becomes the main app at `/`; "Beta" labels removed; the classic app moves to `/classic/`; `/beta/` redirects to `/`.
- **v3.1**: Stationery as one card with stacked rows; Office supplies card back under Services; Other service last; long names wrap.
- **v3.2** (released 2026-10-26; built on branch `v3.2-beta`):
  - No more 5,000-order cap: recent window + all unpaid + recently settled, older orders on demand; full backups.
  - Part-payments (oldest debt first), payment history per order, admin can date a payment.
  - Unpaid page by client (with totals, ages, search) or by order; merge two spellings of a client.
  - Client name required for unpaid orders; names matched across Arabic spellings.
  - Admin edits everything including the time; change log on every order; marking a mistake is logged and warns about debts.
  - Dashboard: Sales / Collected / Outstanding / Net (collected − costs), Daily report with Excel export, expandable sales-by-service breakdown; busy-times grid, top clients, 12-month chart and all hourly analysis removed.
  - Exports carry status, paid, owed and paid date; local restore skips duplicates.
  - "Stationery" renamed "Writing Category / قسم الكتابة".
  - `tests/money.html`: 125 automated checks (run on the demo copy).

---

## 10. Next steps

- **Right after the v3.2 release**: download a full JSON backup from Settings (v3.2 backs up every order, not only the loaded ones), and check the browser console for Firestore "permission" or "index" errors on the first online start.
- Retire `/classic/` (redirect to `/`), since it shows part-paid orders as fully owed.
- Security: per-user Firebase accounts and Firestore rules (see section 3).
- Costs can be deleted but not edited.
- Optional: make the app installable with offline start (PWA), and add a printable receipt.
- Keep the current plain stack. Consider React + TypeScript only if the app grows a lot (more pages, more developers).
