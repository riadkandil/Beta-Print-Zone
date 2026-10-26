'use strict';
/* ==================== RECORDING (POS) ==================== */
const PAPER = ['A4', 'A3', 'A5', 'eng'];
const CATALOG_SVCS = ['books', 'office'];
/* Builder selections. Options keep their values after an item is added, so the next similar item is one Enter away. */
const B = { svc: null, op: 'print', color: 'black', face: 'one', finish: 'normal', final: false, priceAuto: false, editLineId: null };
const cart = { lines: [], pay: 'cash', editingTx: null, dateTouched: false, returnTo: null };
let lineSeq = 0;
const newLineId = () => 'l' + (++lineSeq);

const isPaperSvc = svc => PAPER.includes(svc);
/* Scans are recorded without a quantity; elsewhere an empty quantity counts as 1 */
const bQtyless = () => isPaperSvc(B.svc) && B.op === 'scan';
const numVal = id => parseFloat($(id).value) || 0;
function readQty() { const v = $('bQty').value.trim(); if (!v) return 1; const n = parseInt(v, 10); return n > 0 ? n : 0; }
const isVisible = el => !el.closest('[hidden]');

/* The item exactly as it is stored — the same fields the classic app writes */
function buildItem() {
  const noQty = bQtyless();
  const qty = noQty ? 1 : readQty();
  const price = numVal('bPrice');
  const isFinal = !noQty && B.final;
  if (isPaperSvc(B.svc)) {
    // scans and engineering have no colour, sides or finish; scans are also one price per job
    const plain = B.op === 'scan' || B.svc === 'eng';
    return {
      type: 'paper', svc: B.svc, op: B.op,
      color: plain ? '—' : B.color, face: plain ? '—' : B.face, finish: plain ? '—' : B.finish,
      desc: null, qty, price,
      total: round2(isFinal ? price : qty * price),
      engLength: null, engNote: null, engPerMeter: false, noQty, isFinal,
    };
  }
  return {
    type: B.svc === 'custom' ? 'custom' : 'simple', svc: B.svc, op: null,
    color: '—', face: '—', finish: '—', desc: $('bDesc').value.trim() || null,
    qty, price, total: round2(isFinal ? price : qty * price),
    engLength: null, engNote: null, engPerMeter: false, noQty: false, isFinal,
  };
}
function builderError(it) {
  if (it.svc === 'custom' && !it.desc) return 'b.err.desc';
  if (!it.noQty && !(it.qty > 0)) return 'b.err.qty';
  if (!(it.price > 0)) return 'b.err.price';
  return null;
}

/* ---------- remembered prices ---------- */
const priceIndex = memoTx(() => {
  const any = new Map(), job = new Map();
  for (const tx of liveTx()) for (const it of tx.items || []) {
    if (it.isFinal || !(it.price > 0)) continue;
    const k = itemKey(it);
    if (!any.has(k)) any.set(k, it.price);
    if (it.noQty && !job.has(k)) job.set(k, it.price);
  }
  return { any, job };
});
function suggestPrice(it) {
  const k = itemKey(it);
  // older scan records stored a per-page price; only reuse prices recorded without a quantity
  const needJob = it.noQty && !it.engPerMeter;
  for (let i = cart.lines.length - 1; i >= 0; i--) {
    const l = cart.lines[i];
    if (!l.isFinal && itemKey(l) === k && (!needJob || l.noQty)) return l.price;
  }
  const p = (needJob ? priceIndex().job : priceIndex().any).get(k);
  return p != null ? p : null;
}

/* ---------- service tiles ---------- */
const PAPER_OPS = [['print', 'printer'], ['copy', 'copy'], ['scan', 'scan-line']];
/* Three groups on one screen: paper services as folder cards with Print / Copy / Scan,
   stationery as one card with a row per item, and the other services as small cards */
const tileSection = d => isPaperSvc(d.k) ? 'print' : d.section || d.cat;
const tileDefs = section => SVC_DEFS.filter(d => !d.hidden && tileSection(d) === section);
function tileHtml(d, n) {
  const sel = B.svc === d.k;
  const badge = n ? `<span class="svc-badge">${n}</span>` : '';
  const name = `<span class="svc-name">${escapeHtml(svcLabel(d.k))}</span>`;
  if (!isPaperSvc(d.k)) {
    return `<div class="svc small${sel ? ' sel' : ''}" data-svc="${d.k}"><button type="button" class="svc-main" aria-pressed="${sel}"><span class="svc-ic">${ic(d.icon) || ic('file')}</span>${name}${badge}</button></div>`;
  }
  const art = /^A\d$/.test(d.k) ? `<span class="svc-sheet sheet-${d.k}">${d.k}</span>` : `<span class="svc-ic">${ic(d.icon) || ic('file')}</span>`;
  const ops = PAPER_OPS.map(([op, icon]) => `<button type="button" class="svc-op${sel && B.op === op ? ' sel' : ''}" data-op="${op}">${ic(icon)}<span>${escapeHtml(t('opb.' + op))}</span></button>`).join('');
  return `<div class="svc has-ops${sel ? ' sel' : ''}" data-svc="${d.k}">
      <button type="button" class="svc-main" aria-pressed="${sel}"><span class="svc-art">${art}</span>${name}${badge}</button>
      <div class="svc-ops">${ops}</div>
    </div>`;
}
/* One folder card whose items are stacked rows, so long names fit */
function groupHtml(defs, counts) {
  const rows = defs.map(d => {
    const sel = B.svc === d.k, n = counts[d.k] || 0;
    return `<button type="button" class="svc-row${sel ? ' sel' : ''}" data-svc="${d.k}" aria-pressed="${sel}"><span class="svc-ic">${ic(d.icon) || ic('file')}</span><span class="svc-name">${escapeHtml(svcLabel(d.k))}</span>${n ? `<span class="svc-badge">${n}</span>` : ''}</button>`;
  }).join('');
  return `<div class="svc group"><div class="svc-rows">${rows}</div></div>`;
}
function renderTiles() {
  const counts = {};
  cart.lines.forEach(l => { counts[l.svc] = (counts[l.svc] || 0) + 1; });
  const section = (cat, body) => `<section class="svc-sec"><h2 class="sec-title">${escapeHtml(t('cat.' + cat))}</h2>${body}</section>`;
  const cards = (cat, cls) => `<div class="svc-grid${cls}">${tileDefs(cat).map(d => tileHtml(d, counts[d.k] || 0)).join('')}</div>`;
  $('svcGrid').innerHTML = section('print', cards('print', ''))
    + `<div class="svc-band">${section('shop', `<div class="svc-grid group-grid">${groupHtml(tileDefs('shop'), counts)}</div>`)}${section('extra', cards('extra', ' small'))}</div>`;
}

/* Pricing: one switch on the page decides whether a price is per piece or the total for all pieces */
const pricing = { total: false };
try { pricing.total = localStorage.getItem('pz_beta_total') === '1'; } catch (e) { /* private mode */ }
$('totalPricing').checked = pricing.total;
$('totalPricing').addEventListener('change', () => {
  pricing.total = $('totalPricing').checked;
  try { localStorage.setItem('pz_beta_total', pricing.total ? '1' : '0'); } catch (e) { /* private mode */ }
});

/* ---------- builder ---------- */
function setSeg(id, v) { qsa('#' + id + ' button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); }); }
const descIndex = memoTx(() => {
  const m = {};
  for (const tx of liveTx()) for (const it of tx.items || []) {
    if (it.type === 'paper' || !it.desc) continue;
    (m[it.svc] = m[it.svc] || new Set()).add(it.desc);
  }
  return m;
});
function fillDescList() {
  const set = new Set();
  if (CATALOG_SVCS.includes(B.svc)) ((state.catalog && state.catalog[B.svc]) || []).forEach(x => set.add(x));
  (descIndex()[B.svc] || []).forEach(x => set.add(x));
  $('descList').innerHTML = [...set].slice(0, 300).map(x => `<option value="${escapeHtml(x)}"></option>`).join('');
}
function updateBuilder(opts = {}) {
  const has = !!B.svc, paper = isPaperSvc(B.svc), eng = B.svc === 'eng', qtyless = bQtyless();
  $('builder').hidden = !has;
  $('sheetBackdrop').hidden = !has;
  document.body.classList.toggle('sheet-open', has);
  if (has) {
    const d = SVC_DEF[B.svc];
    $('builder').style.setProperty('--c1', d.c[0]);
    $('builder').style.setProperty('--c2', d.c[1]);
    $('builderIc').innerHTML = ic(d.icon) || ic('file');
    $('builderSub').textContent = t('svcsub.' + B.svc);
  }
  $('paperOpts').hidden = !paper;
  if (paper) {
    setSeg('segOp', B.op); setSeg('segColor', B.color); setSeg('segFace', B.face); setSeg('segFinish', B.finish);
    $('optColor').hidden = $('optFace').hidden = $('optFinish').hidden = B.op === 'scan' || eng;
  }
  // plain items (contract, power of attorney, writing) take no description
  $('fDesc').hidden = !has || paper || !!SVC_DEF[B.svc].plain;
  if (!$('fDesc').hidden) {
    $('bDescLabel').textContent = B.svc === 'custom' ? t('custom.name') : CATALOG_SVCS.includes(B.svc) ? t('b.itemOpt') : t('desc.optional');
    fillDescList();
  }
  $('fQty').hidden = qtyless;
  $('bPriceLabel').textContent = qtyless ? t('price.job') : B.final ? t('price.total') : t('price.unit');
  $('builderTitle').textContent = has ? (B.editLineId ? t('b.edit') + ' · ' : '') + svcLabel(B.svc) : '';
  $('bAddLabel').textContent = t(B.editLineId ? 'b.update' : 'add');
  if (!opts.keepPrice) prefillPrice();
  refreshBuilderState();
}
function prefillPrice() {
  const el = $('bPrice');
  if (!B.svc || (el.value && !B.priceAuto)) return;
  const it = buildItem();
  const p = it.isFinal ? null : suggestPrice(it);
  el.value = p != null ? p : '';
  B.priceAuto = p != null;
}
function refreshBuilderState() {
  if (!B.svc) { $('bAdd').disabled = true; return; }
  const it = buildItem();
  const err = builderError(it);
  $('bLineTotal').textContent = fmtMoney(it.total);
  $('bAdd').disabled = $('bAddSave').disabled = !!err;
  $('bHint').textContent = err ? t(err) + ' · ' : '';
  $('bPriceHint').textContent = B.priceAuto && $('bPrice').value ? t('b.lastPrice') : '';
}
function clearFields() {
  ['bDesc', 'bQty', 'bPrice'].forEach(id => { $(id).value = ''; });
  B.priceAuto = false;
}
function resetBuilder() { B.svc = null; B.editLineId = null; clearFields(); updateBuilder(); renderCart(); }
/* A tile opens its service; a Print / Copy / Scan button on a paper tile also picks the operation */
function selectSvc(svc, op) {
  B.svc = svc;
  B.editLineId = null;
  B.final = pricing.total;
  if (isPaperSvc(svc)) { B.op = op || 'print'; B.color = 'black'; B.face = 'one'; B.finish = 'normal'; }
  clearFields();
  updateBuilder();
  renderCart();
  focusPrice();
}
/* priceIsSuggestion: true when loading a quick pick, so option changes can still re-suggest the price */
function loadIntoBuilder(it, lineId, priceIsSuggestion) {
  B.svc = it.svc;
  B.editLineId = lineId || null;
  if (isPaperSvc(it.svc)) {
    B.op = it.op || 'print';
    B.color = it.color && it.color !== '—' ? it.color : 'black';
    B.face = it.face && it.face !== '—' ? it.face : 'one';
    B.finish = it.finish && it.finish !== '—' ? it.finish : 'normal';
  }
  $('bDesc').value = it.desc || '';
  $('bQty').value = !it.noQty && it.qty > 1 ? it.qty : '';
  B.final = !!it.isFinal; // an edited line keeps its own pricing
  // an older engineering line priced per meter comes back as its job total
  const price = it.svc === 'eng' && it.engPerMeter ? it.total : it.price;
  $('bPrice').value = price > 0 ? price : '';
  B.priceAuto = !!priceIsSuggestion && it.price > 0;
  updateBuilder({ keepPrice: true });
}
/* Choosing a service or an option always lands on the price, selected so typing replaces a remembered price */
function focusPrice() {
  if (!B.svc) return;
  const el = $('bPrice');
  el.focus({ preventScroll: true });
  el.select();
}
/* Adds the item and closes the builder; returns whether an item was added */
function addFromBuilder() {
  if (!B.svc) return false;
  const it = buildItem();
  if (builderError(it)) return false;
  if (B.editLineId) {
    const id = B.editLineId;
    const i = cart.lines.findIndex(l => l.id === id);
    if (i >= 0) cart.lines[i] = { ...it, id }; else cart.lines.push({ ...it, id });
    B.editLineId = null;
    renderCart(id);
  } else addLine(it);
  if (CATALOG_SVCS.includes(it.svc) && it.desc) rememberCatalog(it.svc, it.desc);
  clearFields();
  B.svc = null;
  updateBuilder();
  renderTiles();
  return true;
}
function rememberCatalog(svc, name) {
  const cat = { books: [], office: [], ...(state.catalog || {}) };
  if ((cat[svc] || []).includes(name)) return;
  cat[svc] = [...(cat[svc] || []), name];
  Promise.resolve(store.saveCatalog(cat)).catch(err => console.error(err));
}

function onSeg(id, apply) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    apply(b.dataset.v);
    updateBuilder();
    focusPrice();
  });
}
onSeg('segOp', v => { B.op = v; });
onSeg('segColor', v => { B.color = v; });
onSeg('segFace', v => { B.face = v; });
onSeg('segFinish', v => { B.finish = v; });
$('svcGrid').addEventListener('click', e => {
  const tile = e.target.closest('[data-svc]'); if (!tile) return;
  const op = e.target.closest('[data-op]');
  if (op || e.target.closest('.svc-main, .svc-row')) selectSvc(tile.dataset.svc, op ? op.dataset.op : null);
});
$('sheetBackdrop').addEventListener('click', resetBuilder);
$('bPrice').addEventListener('input', () => { B.priceAuto = false; refreshBuilderState(); });
$('bQty').addEventListener('input', refreshBuilderState);
$('bDesc').addEventListener('input', () => { prefillPrice(); refreshBuilderState(); });
$('qtyInc').addEventListener('click', () => { $('bQty').value = readQty() + 1; refreshBuilderState(); });
$('qtyDec').addEventListener('click', () => { const q = readQty(); $('bQty').value = q > 2 ? q - 1 : ''; refreshBuilderState(); });
$('bReset').addEventListener('click', resetBuilder);
$('bAdd').addEventListener('click', addFromBuilder);
/* one step: add the item and place the order (the client name is optional) */
$('bAddSave').addEventListener('click', () => { if (addFromBuilder()) saveTx(); });
/* Enter walks price → quantity → any required field still empty, then adds the item */
const requiredEmpty = el => isVisible(el) && !el.value && el.id === 'bDesc' && B.svc === 'custom';
['bDesc', 'bQty', 'bPrice'].forEach(id => $(id).addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) return; // Ctrl+Enter is handled below (add + save)
  let next = null;
  if (e.target.id === 'bPrice' && isVisible($('bQty')) && $('bPrice').value) next = $('bQty');
  if (!next) next = ['bPrice', 'bDesc'].map($).find(el => el !== e.target && (el.id === 'bPrice' ? isVisible(el) && !el.value : requiredEmpty(el)));
  if (next) { next.focus(); if (next.select) next.select(); return; }
  if (!$('bAdd').disabled) addFromBuilder();
}));

/* ---------- cart ---------- */
function addLine(item) {
  if (!item.noQty && !item.isFinal) {
    const k = itemKey(item);
    const same = cart.lines.find(l => !l.noQty && !l.isFinal && l.price === item.price && itemKey(l) === k);
    if (same) { same.qty += item.qty; same.total = round2(same.qty * same.price); renderCart(same.id); return; }
  }
  const line = { ...item, id: newLineId() };
  cart.lines.push(line);
  renderCart(line.id);
}
function lineSub(l) {
  const bits = [];
  if (l.svc === 'eng') {
    if (l.engLength > 0) bits.push(l.engLength + ' ' + t('eng.m') + (l.engPerMeter ? ' × ' + fmtNum(l.price) : ''));
    if (l.engNote) bits.push(l.engNote);
  } else if (l.isFinal) bits.push(l.qty + ' · ' + t('inv.final'));
  else if (!l.noQty) bits.push(l.qty + ' × ' + fmtNum(l.price));
  return bits.join(' · ');
}
function renderCart(pulseId) {
  const lines = cart.lines;
  $('cartLines').innerHTML = lines.length ? lines.map(l => {
    const sub = lineSub(l);
    const step = l.noQty || l.isFinal ? '' : `<span class="qty-step"><button type="button" data-act="dec" aria-label="-">${ic('minus')}</button><b>${l.qty}</b><button type="button" data-act="inc" aria-label="+">${ic('plus')}</button></span>`;
    const d = SVC_DEF[l.svc] || SVC_DEF.custom;
    return `<div class="line${l.id === B.editLineId ? ' editing' : ''}${l.id === pulseId ? ' pulse' : ''}" data-id="${l.id}">
      <span class="line-ic" style="--c1:${d.c[0]};--c2:${d.c[1]}">${ic(d.icon) || ic('file')}</span>
      <button type="button" class="line-main" data-act="edit" title="${escapeHtml(t('b.editLine'))}">
        <span class="line-title">${escapeHtml(itemTitle(l))}</span>${sub ? `<span class="line-sub">${escapeHtml(sub)}</span>` : ''}
      </button>
      ${step}
      <span class="line-total">${fmtNum(l.total)}</span>
      <button type="button" class="icon-btn sm ghost" data-act="del" aria-label="${escapeHtml(t('hist.delete'))}">${ic('x')}</button>
    </div>`;
  }).join('') : `<div class="cart-empty"><span class="cart-empty-ic">${ic('shopping-cart')}</span><strong>${t('inv.empty')}</strong><span>${t('inv.emptySub')}</span></div>`;
  const total = lines.reduce((s, l) => s + l.total, 0);
  $('cartTotal').textContent = fmtMoney(total);
  $('sumItems').textContent = lines.length;
  $('orderSub').textContent = cart.editingTx ? fmtDate(cart.editingTx.date) : t('order.no', { n: liveTx().filter(tx => tx.date === todayStr()).length + 1 });
  renderTiles();
  $('btnSave').disabled = !lines.length || saving;
  $('sbCount').textContent = t('cart.items', { n: lines.length });
  $('sbTotal').textContent = fmtMoney(total);
  updateSaveBar();
}
function removeLine(i) {
  const [l] = cart.lines.splice(i, 1);
  if (B.editLineId === l.id) { B.editLineId = null; updateBuilder({ keepPrice: true }); }
  renderCart();
  toast(t('toast.lineRemoved'), { action: { label: t('undo'), fn: () => { cart.lines.splice(Math.min(i, cart.lines.length), 0, l); renderCart(l.id); } } });
}
$('cartLines').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const i = cart.lines.findIndex(l => l.id === btn.closest('.line').dataset.id); if (i < 0) return;
  const l = cart.lines[i];
  const act = btn.dataset.act;
  if (act === 'inc') { l.qty++; l.total = round2(l.qty * l.price); renderCart(); }
  else if (act === 'dec') { if (l.qty > 1) { l.qty--; l.total = round2(l.qty * l.price); renderCart(); } else removeLine(i); }
  else if (act === 'del') removeLine(i);
  else if (act === 'edit') { loadIntoBuilder(l, l.id, false); renderCart(); focusPrice(); }
});
$('cartClear').addEventListener('click', () => {
  if (cart.editingTx) { resetCart(); return; }
  if (!cart.lines.length) return;
  const saved = cart.lines.slice();
  cart.lines = [];
  B.editLineId = null;
  renderCart();
  toast(t('toast.lineRemoved'), { action: { label: t('undo'), fn: () => { cart.lines = saved; renderCart(); } } });
});

function setPay(p) {
  cart.pay = p;
  qsa('#payChips .pchip').forEach(c => { const on = c.dataset.pay === p; c.classList.toggle('sel', on); c.setAttribute('aria-pressed', on); });
  $('payOther').hidden = p !== 'other';
  // an unpaid order must say who owes it
  $('cClient').dataset.i18nPh = p === 'notpaid' ? 'newtx.clientReq' : 'newtx.clientPh';
  $('cClient').placeholder = t($('cClient').dataset.i18nPh);
  if (p !== 'notpaid') $('cClient').parentElement.classList.remove('need');
}
$('cClient').addEventListener('input', () => $('cClient').parentElement.classList.remove('need'));
$('payChips').addEventListener('click', e => { const c = e.target.closest('.pchip'); if (!c) return; setPay(c.dataset.pay); if (cart.pay === 'other') $('payOther').focus(); });
$('noteToggle').addEventListener('click', () => { $('cNotes').hidden = false; $('cNotes').focus(); });
$('cDate').addEventListener('input', () => { cart.dateTouched = true; });

/* past names, newest first, one spelling per client so the list suggests the name already in use */
const clientIndex = memoTx(() => {
  const seen = new Set(), out = [];
  for (const tx of liveTx()) {
    const c = (tx.client || '').trim(), k = clientKey(c);
    if (isDefaultClient(c) || seen.has(k)) continue;
    seen.add(k); out.push(c);
    if (out.length >= 300) break;
  }
  return out;
});
function fillClientList() { $('clientList').innerHTML = clientIndex().map(c => `<option value="${escapeHtml(c)}"></option>`).join(''); }

/* ---------- save ---------- */
let saving = false;
/* Blocks the save with a hint on the client field (used when an unpaid order has no name) */
function needClient() {
  $('cClient').parentElement.classList.add('need');
  $('cClient').focus();
  toast(t('newtx.needClient'), { error: true, ms: 4000 });
}
/* The saved time of an order being edited: its date with the time typed in, or the old timestamp if neither changed */
function editedCreatedAt(tx, date) {
  const time = $('cTime').value;
  if (!time || (date === tx.date && time === $('cTime').dataset.orig)) return tx.createdAt;
  const d = new Date(date + 'T' + time);
  return isNaN(d) ? tx.createdAt : d.toISOString();
}
async function saveTx() {
  if (!cart.lines.length || saving) return;
  if (cart.pay === 'notpaid' && isDefaultClient($('cClient').value)) { needClient(); return; }
  saving = true;
  renderCart();
  const items = cart.lines.map(({ id, ...rest }) => rest);
  const total = round2(items.reduce((s, it) => s + it.total, 0));
  const data = {
    client: $('cClient').value.trim() || t('newtx.defaultClient'),
    // an untouched date follows the calendar, so a tab left open overnight still records today
    date: cart.dateTouched ? ($('cDate').value || todayStr()) : (cart.editingTx ? cart.editingTx.date : todayStr()),
    notes: $('cNotes').value.trim(),
    payMethod: cart.pay,
    payOther: cart.pay === 'other' ? ($('payOther').value.trim() || null) : null,
    items, total,
    pieces: items.reduce((s, it) => s + (it.noQty ? 0 : (it.qty || 0)), 0),
    engMeters: round2(items.reduce((s, it) => s + (it.engLength || 0), 0)),
  };
  try {
    if (cart.editingTx) {
      // work from the latest copy, so a payment recorded meanwhile is not lost
      const cur = state.transactions.find(x => x.id === cart.editingTx.id) || cart.editingTx;
      const now = new Date().toISOString();
      data.createdAt = editedCreatedAt(cur, data.date);
      if (!data.createdAt) delete data.createdAt;
      const paid = cur.payMethod === 'notpaid' ? paymentsSum(cur) : 0;
      if (data.payMethod === 'notpaid') {
        if (cur.payMethod !== 'notpaid') Object.assign(data, { payments: [], paidAt: null });
        else if (paid > total) { toast(t('edit.belowPaid', { n: fmtMoney(paid) }), { error: true, ms: 5000 }); return; }
        else if (paid > 0 && paid === total) {
          // the new total is exactly what was paid: the order is settled by its last payment
          const last = cur.payments[cur.payments.length - 1];
          Object.assign(data, { payMethod: last.method, payOther: last.other || null, paidAt: now });
        }
      } else if (cur.payMethod === 'notpaid') data.paidAt = now;
      const entry = editEntry(cur, data, state.role);
      if (entry) data.edits = [...(cur.edits || []), entry];
      await commit(store.updateTx(cur.id, { ...data, editedAt: now, editedBy: state.role }));
      toast(t('toast.updated'));
      const back = cart.returnTo;
      saving = false;
      resetCart();
      if (back) go(back);
      return;
    } else {
      const res = await commit(store.addTx({ ...data, createdAt: new Date().toISOString(), createdBy: state.role, deviceId: state.deviceId }));
      toast(res === 'queued' ? t('toast.savedQueued') : t('toast.saved') + ' · ' + fmtMoney(total));
    }
    saving = false;
    resetCart();
  } catch (err) {
    console.error(err);
    toast(t('toast.saveErr') + ': ' + ((err && err.message) || ''), { error: true, ms: 6000 });
  } finally {
    saving = false;
    renderCart();
  }
}
$('btnSave').addEventListener('click', saveTx);
$('sbSave').addEventListener('click', saveTx);

function resetCart() {
  cart.lines = []; cart.editingTx = null; cart.dateTouched = false; cart.returnTo = null;
  $('cClient').value = ''; $('cNotes').value = ''; $('cNotes').hidden = true; $('cDate').value = todayStr();
  $('cTime').value = ''; $('cTimeWrap').hidden = true; $('cDate').closest('.order-fields').classList.remove('editing');
  setPay('cash'); $('payOther').value = '';
  $('editBanner').hidden = true;
  $('btnSaveLabel').textContent = t('save.tx');
  resetBuilder();
}
/* cancelling an edit goes back to the page it was started from */
$('cancelEdit').addEventListener('click', () => { const back = cart.returnTo; resetCart(); if (back) go(back); });

/* Admin: open a saved transaction in the cart to change it */
async function editTransaction(tx) {
  if (cart.lines.length && !cart.editingTx) {
    const ok = await askConfirm({ title: t('edit.replaceTitle'), sub: t('edit.replaceSub'), yes: t('hist.edit'), danger: false, icon: 'pencil' });
    if (!ok) return;
  }
  cart.editingTx = tx;
  cart.returnTo = state.page === 'pageNew' ? null : state.page;
  cart.lines = (tx.items || []).map(it => ({ ...it, id: newLineId() }));
  cart.dateTouched = true;
  $('cClient').value = isDefaultClient(tx.client) ? '' : (tx.client || '');
  $('cDate').value = tx.date || todayStr();
  // the admin can also correct the time the order was taken
  const at = tx.createdAt ? new Date(tx.createdAt) : null;
  $('cTime').value = $('cTime').dataset.orig = at && !isNaN(at) ? pad2(at.getHours()) + ':' + pad2(at.getMinutes()) : '';
  $('cTimeWrap').hidden = false;
  $('cDate').closest('.order-fields').classList.add('editing');
  $('cNotes').value = tx.notes || ''; $('cNotes').hidden = !tx.notes;
  setPay(tx.payMethod || 'cash'); $('payOther').value = tx.payOther || '';
  $('editBanner').hidden = false;
  $('editBannerTxt').textContent = t('edit.banner', { date: fmtDate(tx.date) });
  $('btnSaveLabel').textContent = t('save.update');
  B.svc = null; B.editLineId = null; clearFields(); updateBuilder();
  go('pageNew');
  renderCart();
}

/* ---------- mobile save bar: shown while the real Save button is off screen ---------- */
let saveBtnVisible = true;
if ('IntersectionObserver' in window) new IntersectionObserver(es => { saveBtnVisible = es[0].isIntersecting; updateSaveBar(); }).observe($('btnSave'));
function updateSaveBar() {
  $('saveBar').hidden = !(cart.lines.length && !saveBtnVisible && state.page === 'pageNew');
  $('sbSave').disabled = saving;
}

/* Ctrl+Enter: add the pending item (if complete) and save. Esc: clear the builder. */
document.addEventListener('keydown', e => {
  if (!state.role || state.page !== 'pageNew' || !$('confirmOverlay').hidden || !$('payOverlay').hidden) return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (B.svc && !$('bAdd').disabled) addFromBuilder();
    if (B.svc) resetBuilder();
    saveTx();
  } else if (e.key === 'Escape' && B.svc) resetBuilder();
});

pageRenderers.pageNew = function renderPos() {
  renderCart();
  fillClientList();
  if (!cart.dateTouched) $('cDate').value = todayStr();
  if (B.svc) { if (!isPaperSvc(B.svc)) fillDescList(); if (B.priceAuto) prefillPrice(); refreshBuilderState(); }
  updateSaveBar();
};
onLangChange.push(() => {
  updateBuilder({ keepPrice: true });
  renderCart();
  $('btnSaveLabel').textContent = t(cart.editingTx ? 'save.update' : 'save.tx');
  if (cart.editingTx) $('editBannerTxt').textContent = t('edit.banner', { date: fmtDate(cart.editingTx.date) });
});
function initPos() { $('cDate').value = todayStr(); setPay('cash'); updateBuilder(); renderCart(); }
