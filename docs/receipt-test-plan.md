# Receipt test plan

_Saved for later: run this once the 80mm printer is available to test on the Android tablet._


## Context
The shop records orders on an Android tablet and wants a paper receipt to print automatically every time **Place order** is pressed, on an **80mm thermal printer** connected to the tablet. Reprints must also be possible. The app is plain HTML/CSS/JS (no build), served from GitHub Pages; v3.1 is the live version.

A website cannot print silently by itself. Two routes, chosen per device in Settings:
1. **Print window (default, works out of the box):** an 80mm receipt layout + `window.print()`. Android shows its print screen, and the user taps Print (the printer is remembered). For a Bluetooth/USB thermal printer, Android needs a print service such as the free **RawBT** app or the printer maker's app. Arabic prints perfectly because Android draws the page itself.
2. **RawBT direct (no print screen):** the receipt is drawn on a `<canvas>` (so Arabic is just pixels) and turned into ESC/POS raster bytes (`GS v 0`). Those bytes go to the RawBT app through an Android intent link: `intent:base64,…#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`. This intent format comes from developer examples, not official docs, so it must be confirmed on the tablet. Route 1 stays as the fallback.

## Receipt content (current app language, RTL in Arabic)
- Line-art logo (`logo-mono.png`, black; mirrored in English like the app), shop name, phone, address.
- Order no. ("Order #N today"), date and time, client (hidden when it's the default "Client"), served by (role).
- Item lines: `itemTitle(it)` (js/core.js), then qty × price and the line total; "total price" items show the total only.
- Items count, **Total**, payment method; **NOT PAID** in a bold box when unpaid; notes if any.
- Footer message (e.g. "Thank you"), plus the app version in small text.

## Changes

**New `js/receipt.js`** (loaded after `lists.js`, before `settings.js`):
- `receiptData(tx, orderNo)`: one object both routes use. Reuses `itemTitle`, `payLabel`, `fmtNum`, `fmtMoney`, `fmtDate` and `fmtTime` from js/core.js.
- `orderNoFor(tx)`: the tx's position among that day's live orders, sorted by `createdAt`. Used for reprints.
- `receiptHtml(d)`: fills a hidden `#receipt` element for route 1.
- `receiptCanvas(d, widthPx)`: draws the receipt on a canvas, 576px wide for 80mm (384px for 58mm).
  - Text uses Cairo/Roboto with `ctx.direction` set for Arabic, plus helpers for wrapped lines and left/right columns.
  - The logo is drawn and thresholded.
  - Two passes: measure the height, then draw.
- `escposRaster(canvas)`:
  - converts the canvas to 1-bit (luminance < 160 = black);
  - wraps it as `ESC @`, then `GS v 0` in bands of ≤ 256 rows, then feed 4 lines (`ESC d 4`) and a partial cut (`GS V 1`);
  - returns a `Uint8Array`, then base64.
- `printReceipt(tx, {orderNo})`:
  - reads the device settings;
  - route 2 on Android with method `rawbt`: navigates to the intent URL;
  - otherwise route 1: fills `#receipt`, waits for the logo image and `document.fonts.ready`, calls `window.print()`, and clears the receipt on `afterprint`.
  - Errors show a toast and never block saving.

**`js/pos.js` – `saveTx()` (around line 380):**
- Capture `orderNo` before saving (same formula as the `order.no` line, ~line 328).
- After a successful **new** order, if auto-print is on for this device, call `printReceipt({...data, createdAt, createdBy}, {orderNo})`.
- Edited orders don't auto-print; they can be reprinted from History.

**`js/lists.js` – `txDetail()` (line 63):** add a **Print receipt** button (all roles) and handle `act === 'print'` in `txAction()`.

**`index.html`:**
- empty `<div id="receipt" class="receipt" aria-hidden="true"></div>` before the scripts;
- `<script src="js/receipt.js">`;
- a new **Receipt** panel in Settings with:
  - shop name, phone, address and footer fields (shared, saved in `settings/config` as `receipt: {name, phone, address, footer}` through the existing `store.saveSettings` in js/core.js);
  - **This device** settings: "Print after Place order" switch (default on), method (Print window / RawBT direct), paper (80mm / 58mm), stored in localStorage `pz_print_auto`, `pz_print_method`, `pz_print_width`;
  - a **Test print** button using a sample order.

**`js/settings.js`:** render the Receipt panel in `renderSettings()` and save fields like the existing password/machine panels do (reusing the `toast` patterns).

**`js/core.js`:** EN/AR strings (`rc.*` keys); version `v3.2`.

**`css/app.css`:**
- On screen, `.receipt{display:none}`.
- `@media print`: hide everything except `#receipt`, `@page{margin:0}`, receipt width `72mm` (`48mm` for 58mm paper).
- Black-only text with dashed rules, a bold total and `print-color-adjust:exact`.
- Receipt panel styles reuse the existing `.panel`, `.field`, `.switch` and `.chip` classes.

**Docs:** README and APP-SUMMARY get a "Receipts" section with the one-time tablet setup:
- Install RawBT and add the printer (Bluetooth/USB/Wi-Fi).
- Turn on RawBT as a print service (route 1), or pick "RawBT direct" in Settings (route 2).
- Set the paper to 80mm.

## Verification
1. **Route 1 layout:** use headless Chrome `--print-to-pdf` on the demo copy, with a test hook that renders a seeded order into `#receipt`. Read the PDF in English and Arabic and check width, RTL, Not Paid box and totals.
2. **Route 2 bytes:** a Python script parses the generated ESC/POS (`GS v 0` bands) back into a PNG. View it to confirm it matches the canvas, Arabic included, the width is 576px, and it ends with feed + cut.
3. **Flow:**
   - In the demo, Place order calls print exactly once.
   - Auto-print off means no call.
   - Edits don't print.
   - History → Print receipt reprints with the right order number.
   - Settings fields save and reload.
   - No console errors.
   - New order still fits one screen at 1366×768.
4. **On the tablet (you):** Test print from Settings with each method. RawBT direct needs this real-device check before we rely on it.
5. Push to GitHub Pages only after you approve.
