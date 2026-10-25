'use strict';
/* ==================== RECORDING (POS) ==================== */
const PAPER = ['A4', 'A3', 'A5', 'eng'];
const CATALOG_SVCS = ['books', 'office'];
/* Builder selections. Options keep their values after an item is added, so the next similar item is one Enter away. */
const B = { svc: null, op: 'print', color: 'black', face: 'one', finish: 'normal', engPerMeter: true, priceAuto: false, editLineId: null };
const cart = { lines: [], pay: 'cash', editingTx: null, dateTouched: false };
let lineSeq = 0;
const newLineId = () => 'l' + (++lineSeq);

const isPaperSvc = svc => PAPER.includes(svc);
/* Scans and engineering are recorded without a quantity */
const bQtyless = () => B.svc === 'eng' || (isPaperSvc(B.svc) && B.op === 'scan');
const numVal = id => parseFloat($(id).value) || 0;
function readQty() { const v = $('bQty').value.trim(); if (!v) return 1; const n = parseInt(v, 10); return n > 0 ? n : 0; }
const isVisible = el => !el.closest('[hidden]');

/* The item exactly as it is stored — the same fields the classic app writes */
function buildItem() {
  const noQty = bQtyless();
  const qty = noQty ? 1 : readQty();
  const price = numVal('bPrice');
  const isFinal = !noQty && $('bFinal').checked;
  if (isPaperSvc(B.svc)) {
    const eng = B.svc === 'eng', scan = B.op === 'scan';
    const len = eng ? numVal('bLength') : null;
    const perMeter = eng && B.engPerMeter;
    return {
      type: 'paper', svc: B.svc, op: B.op,
      color: scan ? '—' : B.color, face: scan ? '—' : B.face, finish: scan ? '—' : B.finish,
      desc: null, qty, price,
      total: round2(isFinal ? price : perMeter ? price * (len || 0) : qty * price),
      engLength: eng ? (len || 0) : null, engNote: eng ? $('bEngNote').value.trim() : null,
      engPerMeter: perMeter, noQty, isFinal,
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
  if ((CATALOG_SVCS.includes(it.svc) || it.svc === 'custom') && !it.desc) return 'b.err.desc';
  // a scan priced per meter needs the length too, or its total would be 0
  if (it.svc === 'eng' && (it.op !== 'scan' || it.engPerMeter) && !(it.engLength > 0)) return 'b.err.length';
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

/* ---------- quick picks: the most frequent items of the last 400 transactions ---------- */
function templateFrom(it) {
  const paper = it.type === 'paper';
  const scan = paper && it.op === 'scan';
  return {
    type: it.type, svc: it.svc, op: paper ? it.op : null,
    color: paper && !scan ? (it.color && it.color !== '—' ? it.color : 'black') : '—',
    face: paper && !scan ? (it.face && it.face !== '—' ? it.face : 'one') : '—',
    finish: paper && !scan ? (it.finish && it.finish !== '—' ? it.finish : 'normal') : '—',
    desc: paper ? null : (it.desc || null),
    engPerMeter: it.svc === 'eng' ? !!it.engPerMeter : false,
    noQty: paper && (it.svc === 'eng' || scan),
  };
}
const DEFAULT_PICKS = [
  { type: 'paper', svc: 'A4', op: 'print', color: 'black' },
  { type: 'paper', svc: 'A4', op: 'print', color: 'color' },
  { type: 'paper', svc: 'A4', op: 'copy', color: 'black' },
  { type: 'paper', svc: 'A4', op: 'scan' },
  { type: 'paper', svc: 'A3', op: 'print', color: 'black' },
  { type: 'paper', svc: 'eng', op: 'print', color: 'black', engPerMeter: true },
  { type: 'paper', svc: 'eng', op: 'scan', engPerMeter: true },
  { type: 'simple', svc: 'wrap' },
].map(templateFrom);
const quickPicks = memoTx(() => {
  const freq = new Map();
  let n = 0;
  for (const tx of liveTx()) {
    if (++n > 400) break;
    for (const it of tx.items || []) {
      const tpl = templateFrom(it), k = itemKey(tpl);
      const f = freq.get(k);
      if (f) f.count++; else freq.set(k, { tpl, count: 1 });
    }
  }
  const picks = [...freq.values()].filter(f => f.count >= 2).sort((a, b) => b.count - a.count).slice(0, 8).map(f => f.tpl);
  // a default is skipped when a learned pick already covers the same service and operation (e.g. engineering scan at a fixed price)
  const loose = p => [p.type, p.svc, p.op, p.color, p.type === 'paper' ? '' : (p.desc || '')].join('|');
  for (const d of DEFAULT_PICKS) { if (picks.length >= 8) break; if (!picks.some(p => loose(p) === loose(d))) picks.push(d); }
  return picks;
});
function tileNeedsInput(tpl, price) {
  if (!(price > 0)) return true;
  if (tpl.svc === 'eng' && (tpl.op !== 'scan' || tpl.engPerMeter)) return true;
  return (CATALOG_SVCS.includes(tpl.svc) || tpl.svc === 'custom') && !tpl.desc;
}
let shownPicks = [];
function renderQuick() {
  shownPicks = quickPicks();
  $('quickGrid').innerHTML = shownPicks.map((p, i) => {
    const price = suggestPrice(p);
    const needs = tileNeedsInput(p, price);
    const priceTxt = price != null ? fmtNum(price) + (p.engPerMeter ? ' / ' + t('eng.m') : '') : '';
    const sub = needs ? [priceTxt, t('qp.needs')].filter(Boolean).join(' · ') : priceTxt;
    return `<button type="button" class="qp${needs ? ' needs' : ''}" data-i="${i}">
      <span class="qp-ic">${ic(SVC_ICONS[p.svc] || 'file')}</span>
      <span class="qp-txt"><span class="qp-name">${escapeHtml(itemTitle(p))}</span><span class="qp-price">${escapeHtml(sub)}</span></span>
      ${needs ? ic('chevron-left', 'qp-go') : ic('plus', 'qp-go')}
    </button>`;
  }).join('');
}
$('quickGrid').addEventListener('click', e => {
  const b = e.target.closest('.qp'); if (!b) return;
  const tpl = shownPicks[+b.dataset.i]; if (!tpl) return;
  const price = suggestPrice(tpl);
  if (tileNeedsInput(tpl, price)) {
    loadIntoBuilder({ ...tpl, qty: 1, price, isFinal: false, engLength: null, engNote: '' }, null, true);
    scrollToBuilder();
    focusFirstField(true);
    return;
  }
  const eng = tpl.svc === 'eng';
  addLine({ ...tpl, qty: 1, price, total: round2(price), engLength: eng ? 0 : null, engNote: eng ? '' : null, isFinal: false });
  b.classList.remove('added'); void b.offsetWidth; b.classList.add('added');
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
  qsa('#svcGrid .svc').forEach(b => { const on = b.dataset.svc === B.svc; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); });
  $('builderEmpty').hidden = has;
  $('bFields').hidden = !has;
  $('bFoot').hidden = !has;
  $('paperOpts').hidden = !paper;
  if (paper) {
    setSeg('segOp', B.op); setSeg('segColor', B.color); setSeg('segFace', B.face); setSeg('segFinish', B.finish);
    setSeg('segEngPm', B.engPerMeter ? 'meter' : 'fixed');
    $('optColor').hidden = $('optFace').hidden = $('optFinish').hidden = B.op === 'scan';
    $('optEngPm').hidden = !eng;
  }
  $('fDesc').hidden = !has || paper;
  if (has && !paper) {
    $('bDescLabel').textContent = B.svc === 'custom' ? t('custom.name') : CATALOG_SVCS.includes(B.svc) ? t('b.item') : t('desc.optional');
    fillDescList();
  }
  $('fLength').hidden = !eng;
  $('fEngNote').hidden = !eng;
  $('fQty').hidden = qtyless;
  $('fFinal').hidden = qtyless;
  if (qtyless) $('bFinal').checked = false;
  $('bPriceLabel').textContent = eng && B.engPerMeter ? t('price.meter') : qtyless ? t('price.job') : $('bFinal').checked ? t('price.total') : t('price.unit');
  $('builderTitle').textContent = t(B.editLineId ? 'b.edit' : 'b.title');
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
  $('bAdd').disabled = !!err;
  $('bHint').textContent = err ? t(err) + ' · ' : '';
  $('bPriceHint').textContent = B.priceAuto && $('bPrice').value ? t('b.lastPrice') : '';
}
function clearFields() {
  ['bDesc', 'bLength', 'bEngNote', 'bQty', 'bPrice'].forEach(id => { $(id).value = ''; });
  $('bFinal').checked = false;
  B.priceAuto = false;
}
function resetBuilder() { B.svc = null; B.editLineId = null; clearFields(); updateBuilder(); renderCart(); }
function selectSvc(svc) {
  B.svc = svc;
  if (isPaperSvc(svc)) { B.op = 'print'; B.color = 'black'; B.face = 'one'; B.finish = 'normal'; }
  clearFields();
  updateBuilder();
  focusFirstField();
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
    if (it.svc === 'eng') B.engPerMeter = !!it.engPerMeter;
  }
  $('bDesc').value = it.desc || '';
  $('bLength').value = it.engLength > 0 ? it.engLength : '';
  $('bEngNote').value = it.engNote || '';
  $('bQty').value = !it.noQty && it.qty > 1 ? it.qty : '';
  $('bFinal').checked = !!it.isFinal;
  $('bPrice').value = it.price > 0 ? it.price : '';
  B.priceAuto = !!priceIsSuggestion && it.price > 0;
  updateBuilder({ keepPrice: true });
}
/* Focus the first empty field. On touch screens only when there is nothing left to tap,
   so the keyboard does not cover the option buttons. */
function focusFirstField(force) {
  if (!B.svc) return;
  const nothingToTap = !isPaperSvc(B.svc) || B.op === 'scan';
  if (!finePointer && !nothingToTap && !force) return;
  const el = ['bDesc', 'bLength', 'bQty', 'bPrice'].map($).find(x => isVisible(x) && !x.value) || $('bPrice');
  if (!isVisible(el)) return;
  el.focus({ preventScroll: !finePointer });
  if (el.select) el.select();
}
function scrollToBuilder() {
  const r = $('builder').getBoundingClientRect();
  if (r.top < 60 || r.top > innerHeight * 0.6) $('builder').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function addFromBuilder() {
  if (!B.svc) return;
  const it = buildItem();
  if (builderError(it)) return;
  if (B.editLineId) {
    const id = B.editLineId;
    const i = cart.lines.findIndex(l => l.id === id);
    if (i >= 0) cart.lines[i] = { ...it, id }; else cart.lines.push({ ...it, id });
    B.editLineId = null;
    renderCart(id);
  } else addLine(it);
  if (CATALOG_SVCS.includes(it.svc) && it.desc) rememberCatalog(it.svc, it.desc);
  clearFields();
  updateBuilder();
  focusFirstField();
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
    focusFirstField();
  });
}
onSeg('segOp', v => { B.op = v; });
onSeg('segColor', v => { B.color = v; });
onSeg('segFace', v => { B.face = v; });
onSeg('segFinish', v => { B.finish = v; });
onSeg('segEngPm', v => { B.engPerMeter = v === 'meter'; });
$('svcGrid').addEventListener('click', e => { const b = e.target.closest('.svc'); if (b) selectSvc(b.dataset.svc); });
$('bPrice').addEventListener('input', () => { B.priceAuto = false; refreshBuilderState(); });
['bQty', 'bLength', 'bEngNote'].forEach(id => $(id).addEventListener('input', refreshBuilderState));
$('bDesc').addEventListener('input', () => { prefillPrice(); refreshBuilderState(); });
$('bFinal').addEventListener('change', () => updateBuilder());
$('qtyInc').addEventListener('click', () => { $('bQty').value = readQty() + 1; refreshBuilderState(); });
$('qtyDec').addEventListener('click', () => { const q = readQty(); $('bQty').value = q > 2 ? q - 1 : ''; refreshBuilderState(); });
$('bReset').addEventListener('click', resetBuilder);
$('bAdd').addEventListener('click', addFromBuilder);
/* Enter adds the item when it is complete, otherwise moves to the next empty field */
['bDesc', 'bLength', 'bQty', 'bPrice', 'bEngNote'].forEach(id => $(id).addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) return; // Ctrl+Enter is handled below (add + save)
  if (!$('bAdd').disabled) { addFromBuilder(); return; }
  const next = ['bDesc', 'bLength', 'bQty', 'bPrice'].map($).find(el => el !== e.target && isVisible(el) && !el.value);
  if (next) { next.focus(); if (next.select) next.select(); }
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
    else if (!l.engPerMeter) bits.push(t('eng.fixed'));
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
    return `<div class="line${l.id === B.editLineId ? ' editing' : ''}${l.id === pulseId ? ' pulse' : ''}" data-id="${l.id}">
      <button type="button" class="line-main" data-act="edit" title="${escapeHtml(t('b.editLine'))}">
        <span class="line-title">${escapeHtml(itemTitle(l))}</span>${sub ? `<span class="line-sub">${escapeHtml(sub)}</span>` : ''}
      </button>
      ${step}
      <span class="line-total">${fmtNum(l.total)}</span>
      <button type="button" class="icon-btn sm ghost" data-act="del" aria-label="${escapeHtml(t('hist.delete'))}">${ic('x')}</button>
    </div>`;
  }).join('') : `<div class="cart-empty">${ic('shopping-cart')}<span>${t('inv.empty')}</span></div>`;
  const total = lines.reduce((s, l) => s + l.total, 0);
  $('cartTotal').textContent = fmtMoney(total);
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
  else if (act === 'edit') { loadIntoBuilder(l, l.id, false); renderCart(); scrollToBuilder(); focusFirstField(true); }
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
}
$('payChips').addEventListener('click', e => { const c = e.target.closest('.pchip'); if (!c) return; setPay(c.dataset.pay); if (cart.pay === 'other') $('payOther').focus(); });
$('noteToggle').addEventListener('click', () => { $('cNotes').hidden = false; $('cNotes').focus(); });
$('cDate').addEventListener('input', () => { cart.dateTouched = true; });

const clientIndex = memoTx(() => {
  const defaults = new Set([I18N.en['newtx.defaultClient'], I18N.ar['newtx.defaultClient']]);
  const s = new Set();
  for (const tx of liveTx()) { const c = (tx.client || '').trim(); if (c && !defaults.has(c)) s.add(c); if (s.size >= 300) break; }
  return [...s];
});
function fillClientList() { $('clientList').innerHTML = clientIndex().map(c => `<option value="${escapeHtml(c)}"></option>`).join(''); }

/* ---------- save ---------- */
let saving = false;
async function saveTx() {
  if (!cart.lines.length || saving) return;
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
      await commit(store.updateTx(cart.editingTx.id, { ...data, editedAt: new Date().toISOString(), editedBy: state.role }));
      toast(t('toast.updated'));
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
  cart.lines = []; cart.editingTx = null; cart.dateTouched = false;
  $('cClient').value = ''; $('cNotes').value = ''; $('cNotes').hidden = true; $('cDate').value = todayStr();
  setPay('cash'); $('payOther').value = '';
  $('editBanner').hidden = true;
  $('btnSaveLabel').textContent = t('save.tx');
  resetBuilder();
}
$('cancelEdit').addEventListener('click', resetCart);

/* Admin: open a saved transaction in the cart to change it */
async function editTransaction(tx) {
  if (cart.lines.length && !cart.editingTx) {
    const ok = await askConfirm({ title: t('edit.replaceTitle'), sub: t('edit.replaceSub'), yes: t('hist.edit'), danger: false, icon: 'pencil' });
    if (!ok) return;
  }
  const defaults = [I18N.en['newtx.defaultClient'], I18N.ar['newtx.defaultClient']];
  cart.editingTx = tx;
  cart.lines = (tx.items || []).map(it => ({ ...it, id: newLineId() }));
  cart.dateTouched = true;
  $('cClient').value = defaults.includes(tx.client) ? '' : (tx.client || '');
  $('cDate').value = tx.date || todayStr();
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
    saveTx();
  } else if (e.key === 'Escape' && B.svc) resetBuilder();
});

pageRenderers.pageNew = function renderPos() {
  renderQuick();
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
