'use strict';
/* ==================== HISTORY ==================== */
const H = { range: 'today', flags: new Set(), limit: 60, open: new Set() };
const searchCache = new WeakMap();
function txSearchText(tx) {
  const c = searchCache.get(tx);
  if (c && c.lang === lang) return c.text;
  const text = [tx.client, tx.notes, tx.date, payLabel(tx), txSummary(tx), fmtNum(tx.total || 0)].join(' ').toLowerCase();
  searchCache.set(tx, { lang, text });
  return text;
}
function historyRows() {
  const q = $('hSearch').value.trim().toLowerCase();
  return sortedTx().filter(tx => {
    if (!inRange(tx.date, H.range)) return false;
    if (H.flags.has('unpaid') && !(owed(tx) > 0)) return false;
    if (H.flags.has('mistake') && !tx.mistake) return false;
    return !q || txSearchText(tx).includes(q);
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
function renderHistory() {
  const loading = H.range === 'all' && loadOlder('');
  const rows = historyRows();
  const isAdmin = state.role === 'admin';
  const sum = $('hSummary');
  sum.hidden = !rows.length && !loading;
  const liveTotal = rows.reduce((s, tx) => s + (tx.mistake ? 0 : (tx.total || 0)), 0);
  sum.innerHTML = `<span>${t('hist.count', { n: rows.length })}${loading ? ' · ' + t('load.older') : ''}</span>${isAdmin ? `<strong>${fmtMoney(liveTotal)}</strong>` : ''}`;
  if (!rows.length) {
    const any = state.transactions.length > 0;
    $('hList').innerHTML = `<div class="empty">${ic('inbox')}<p>${t(any ? 'hist.noresults' : 'hist.empty')}</p>${any && H.range !== 'all' ? `<button type="button" class="btn btn-ghost" data-act="showall">${t('hist.showAll')}</button>` : ''}</div>`;
    $('hMore').hidden = true;
    return;
  }
  const dayCount = {}, dayTotal = {};
  rows.forEach(tx => { dayCount[tx.date] = (dayCount[tx.date] || 0) + 1; if (!tx.mistake) dayTotal[tx.date] = (dayTotal[tx.date] || 0) + (tx.total || 0); });
  let html = '', day = null;
  for (const tx of rows.slice(0, H.limit)) {
    if (tx.date !== day) {
      if (day !== null) html += '</div>';
      day = tx.date;
      html += `<div class="day-group"><div class="day-head"><span>${escapeHtml(fmtDay(day))}</span><span class="muted">${t('hist.count', { n: dayCount[day] })}${isAdmin ? ' · <b>' + fmtMoney(dayTotal[day] || 0) + '</b>' : ''}</span></div>`;
    }
    html += txCard(tx);
  }
  $('hList').innerHTML = html + '</div>';
  $('hMore').hidden = rows.length <= H.limit;
}
function txCard(tx, opts = {}) {
  const open = H.open.has(tx.id);
  const due = owed(tx), part = due > 0 && due < round2(tx.total);
  // on the Unpaid page every row owes, so it shows the amount still owed, its age and any part-payment;
  // inside a client's group the date stands in for the client's name
  const owing = opts.owedFirst && due > 0;
  const title = opts.inGroup ? fmtDate(tx.date) : tx.client || '';
  const badges = (tx.mistake ? `<span class="badge danger">${ic('alert-triangle')}${t('hist.mistake')}</span>` : '')
    + (owing ? (part ? `<span class="badge">${ic('check')}${escapeHtml(t('xh.paid') + ' ' + fmtNum(paidAmount(tx)))}</span>` : '')
      : due > 0 ? `<span class="badge danger">${ic('clock')}${escapeHtml(part ? t('pay.owes', { n: fmtNum(due) }) : payLabel(tx))}</span>` : '');
  const meta = owing ? (opts.inGroup ? ageLabel(tx.date) : fmtDate(tx.date) + ' · ' + ageLabel(tx.date))
    : [tx.createdAt ? fmtTime(tx.createdAt) : '', due > 0 ? '' : payLabel(tx)].filter(Boolean).join(' · ');
  const amount = owing ? due : tx.total || 0;
  const pay = opts.payBtn && due > 0 ? `<button type="button" class="btn btn-sm btn-save row-pay" data-act="paid">${ic('banknote')}<span>${t('pay.record')}</span></button>` : '';
  return `<article class="tx${tx.mistake ? ' mistake' : ''}${open ? ' open' : ''}" data-id="${escapeHtml(tx.id)}">
    <div class="tx-line">
      <button type="button" class="tx-row" data-act="toggle" aria-expanded="${open}">
        <span class="tx-ic doc${due > 0 ? ' due' : ''}">${ic('file-text')}</span>
        <span class="tx-main"><span class="tx-client">${escapeHtml(title)}${badges}</span><span class="tx-items">${escapeHtml(txSummary(tx))}</span></span>
        <span class="tx-side"><span class="tx-total${owing ? ' due' : ''}">${fmtNum(amount)}</span><span class="tx-meta">${escapeHtml(meta)}</span></span>
      </button>${pay}
    </div>
    ${open ? txDetail(tx) : ''}
  </article>`;
}
const ageDays = date => Math.round((new Date(todayStr() + 'T00:00:00') - new Date(date + 'T00:00:00')) / 864e5);
function ageLabel(date) { const n = ageDays(date); return n <= 0 ? t('unpaid.today') : t('unpaid.daysAgo', { n }); }
const roleName = by => t('role.' + (by === 'admin' ? 'admin' : 'employee'));
const stamp = iso => (isoDay(iso) ? fmtDate(isoDay(iso), { day: 'numeric', month: 'short' }) + ' ' + fmtTime(iso) : '');
/* One change-log line: what changed, old → new */
function logLine(e) {
  if (e.kind === 'mistake' || e.kind === 'unmistake') return t('log.' + e.kind);
  const show = (k, v) => {
    if (v === '' || v == null) return t('log.empty');
    if (k === 'total') return fmtNum(v);
    if (k === 'date') return fmtDate(v);
    if (k === 'time') return fmtTime(v);
    if (k === 'pay') return PAY_LABELS[v] ? PAY_LABELS[v][lang] : v;
    return v;
  };
  return Object.entries(e.changes || {}).map(([k, c]) => `${t('log.' + k)}: ${show(k, c.from)} → ${show(k, c.to)}`).join(' · ');
}
function txDetail(tx) {
  const isAdmin = state.role === 'admin';
  const rows = (tx.items || []).map(it => {
    const extra = (it.engLength > 0 ? ` <span class="muted">${it.engLength} ${t('eng.m')}</span>` : '') + (it.engNote ? ` <span class="muted">— ${escapeHtml(it.engNote)}</span>` : '');
    const price = it.isFinal ? t('inv.final') : fmtNum(it.price) + (it.engPerMeter ? ' / ' + t('eng.m') : '');
    return `<tr><td>${escapeHtml(itemTitle(it))}${extra}</td><td>${it.noQty ? '—' : it.qty}</td><td>${escapeHtml(price)}</td><td>${fmtNum(it.total)}</td></tr>`;
  }).join('');
  const due = owed(tx);
  const acts = [];
  if (due > 0) acts.push(`<button type="button" class="btn btn-sm btn-save" data-act="paid">${ic('banknote')}${t('pay.record')}</button>`);
  if (isAdmin) acts.push(`<button type="button" class="btn btn-sm btn-ghost" data-act="edit">${ic('pencil')}${t('hist.edit')}</button>`);
  if (!isAdmin || tx.mistake) acts.push(`<button type="button" class="btn btn-sm btn-warn" data-act="mistake">${ic('alert-triangle')}${t(tx.mistake ? 'hist.unmarkMistake' : 'hist.markMistake')}</button>`);
  if (isAdmin) acts.push(`<button type="button" class="btn btn-sm btn-danger-soft" data-act="delete">${ic('trash-2')}${t('hist.delete')}</button>`);
  const meta = [t('hist.by') + ': ' + roleName(tx.createdBy), tx.editedAt ? t('hist.edited') : ''].filter(Boolean).join(' · ');
  // money received, with its day and method; part-paid orders also say how much is left
  const got = collections(tx);
  const pays = (tx.payments || []).length || tx.paidAt ? got.map(c => `<li><span>${escapeHtml(fmtDate(c.date))}</span><span>${escapeHtml(c.method === 'other' ? c.other || PAY_LABELS.other[lang] : PAY_LABELS[c.method] ? PAY_LABELS[c.method][lang] : c.method)}</span><b>${fmtNum(c.amount)}</b></li>`).join('') : '';
  const paidLine = isOpen(tx) && paidAmount(tx) > 0 ? `<p class="tx-paid">${escapeHtml(t('hist.paidOf', { p: fmtNum(paidAmount(tx)), t: fmtNum(tx.total) }))} · <b>${escapeHtml(t('pay.owes', { n: fmtNum(due) }))}</b></p>` : '';
  const log = (tx.edits || []).slice().reverse().map(e => `<li><span class="muted">${escapeHtml(stamp(e.at))} · ${escapeHtml(roleName(e.by))}</span><span>${escapeHtml(logLine(e))}</span></li>`).join('');
  return `<div class="tx-detail">
    <div class="table-wrap"><table class="items-table"><thead><tr><th>${t('th.item')}</th><th>${t('th.qty')}</th><th>${t('th.price')}</th><th>${t('th.total')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${tx.notes ? `<p class="tx-notes">${ic('sticky-note')} ${escapeHtml(tx.notes)}</p>` : ''}
    ${paidLine}
    ${pays ? `<h4 class="tx-sub">${ic('banknote')}${t('hist.payments')}</h4><ul class="pay-log">${pays}</ul>` : ''}
    ${log ? `<h4 class="tx-sub">${ic('history')}${t('hist.changes')}</h4><ul class="change-log">${log}</ul>` : ''}
    <p class="muted small">${escapeHtml(meta)}</p>
    <div class="tx-actions">${acts.join('')}</div>
  </div>`;
}

/* Records money against one order or a client's orders (oldest first); the rest stays owed */
async function recordPayment(txs, who) {
  const due = round2(txs.reduce((s, tx) => s + owed(tx), 0));
  if (!(due > 0)) return;
  const res = await askPayment({ sub: who, due });
  if (!res) return;
  const updates = allocatePayment(txs, { ...res, by: state.role });
  await commit(store.updateMany(updates.map(u => ({ id: u.tx.id, patch: u.patch }))));
  const left = round2(due - res.amount);
  toast(left > 0 ? t('toast.paidPart', { n: fmtMoney(left) }) : t('toast.paid'));
}
async function txAction(act, tx) {
  try {
    if (act === 'paid') await recordPayment([tx], tx.client + ' · ' + fmtDate(tx.date));
    else if (act === 'edit' && state.role === 'admin') await editTransaction(tx);
    else if (act === 'mistake') {
      // marking and unmarking go in the change log; an order that still owes says the debt will go
      const due = owed(tx);
      const ok = tx.mistake || await askConfirm({ title: t('confirm.mistake'), sub: due > 0 ? t('confirm.mistakeDebt', { n: fmtMoney(due) }) : t('confirm.mistakeSub'), yes: t('confirm.mark'), danger: due > 0, icon: 'alert-triangle' });
      if (ok) {
        const edits = [...(tx.edits || []), { at: new Date().toISOString(), by: state.role, kind: tx.mistake ? 'unmistake' : 'mistake' }];
        await commit(store.updateTx(tx.id, { mistake: !tx.mistake, edits }));
        toast(t(tx.mistake ? 'toast.mistakeUnmarked' : 'toast.mistakeMarked'));
      }
    } else if (act === 'delete' && state.role === 'admin') {
      if (await askConfirm({ title: t('confirm.delTx'), sub: t('confirm.delTxSub') })) {
        await commit(store.delTx(tx.id));
        H.open.delete(tx.id);
        toast(t('toast.deleted'));
      }
    }
  } catch (err) {
    console.error(err);
    toast(t('toast.saveErr') + ': ' + ((err && err.message) || ''), { error: true, ms: 6000 });
  }
  renderActivePage();
}
/* History and Unpaid share the order rows: open/close a row, or act on its order */
function onTxListClick(e) {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  if (btn.dataset.act === 'showall') { H.range = 'all'; setActiveChip($('hRange'), 'range', 'all'); renderHistory(); return; }
  const card = btn.closest('.tx'); if (!card) return;
  const tx = state.transactions.find(x => String(x.id) === card.dataset.id); if (!tx) return;
  if (btn.dataset.act === 'toggle') { H.open.has(tx.id) ? H.open.delete(tx.id) : H.open.add(tx.id); renderActivePage(); return; }
  txAction(btn.dataset.act, tx);
}
$('hList').addEventListener('click', onTxListClick);
$('hRange').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; H.range = c.dataset.range; H.limit = 60; setActiveChip($('hRange'), 'range', H.range); renderHistory(); });
$('hFlags').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  const f = c.dataset.flag;
  H.flags.has(f) ? H.flags.delete(f) : H.flags.add(f);
  c.classList.toggle('active', H.flags.has(f));
  renderHistory();
});
$('hSearch').addEventListener('input', debounce(() => { H.limit = 60; renderHistory(); }, 150));
$('hMore').addEventListener('click', () => { H.limit += 60; renderHistory(); });
document.addEventListener('keydown', e => {
  if (e.key === '/' && state.page === 'pageHistory' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('hSearch').focus(); }
});
pageRenderers.pageHistory = renderHistory;

/* ==================== UNPAID ==================== */
/* Debts grouped by client (names folded and merged), or one row per order; oldest debt first inside a client */
const U = { view: 'client', open: new Set() };
function unpaidGroups() {
  const groups = new Map();
  for (const tx of liveTx()) {
    const due = owed(tx); if (!(due > 0)) continue;
    const k = resolveClientKey(tx.client);
    const g = groups.get(k) || { key: k, name: '', txs: [], owed: 0, total: 0 };
    if (!g.name) g.name = tx.client || '';   // liveTx is newest first, so this is the latest spelling
    g.txs.push(tx); g.owed = round2(g.owed + due); g.total = round2(g.total + (tx.total || 0));
    groups.set(k, g);
  }
  // a merge target's own spelling wins over the old names
  const al = clientAliases();
  Object.values(al).forEach(name => { const g = groups.get(clientKey(name)); if (g) g.name = name; });
  return [...groups.values()].map(g => ({ ...g, txs: g.txs.sort(byOldest), oldest: g.txs.reduce((m, tx) => (tx.date < m ? tx.date : m), g.txs[0].date) }))
    .sort((a, b) => b.owed - a.owed);
}
function renderUnpaid() {
  const q = clientKey($('uSearch').value);
  const all = unpaidGroups();
  const groups = q ? all.filter(g => g.key.includes(q) || g.txs.some(tx => clientKey(tx.client).includes(q))) : all;
  const nOrders = all.reduce((n, g) => n + g.txs.length, 0);
  const total = round2(all.reduce((s, g) => s + g.owed, 0));
  $('uSummary').innerHTML = `<span>${t('unpaid.total')} · ${escapeHtml(t('unpaid.sum', { c: all.length, o: nOrders }))}</span><strong>${fmtMoney(total)}</strong>`;
  $('uMerge').hidden = state.role !== 'admin';
  if (!all.length) { $('uList').innerHTML = `<div class="empty">${ic('check-circle')}<p>${t('unpaid.empty')}</p></div>`; return; }
  if (!groups.length) { $('uList').innerHTML = `<div class="empty">${ic('search')}<p>${t('unpaid.noMatch')}</p></div>`; return; }
  if (U.view === 'order') {
    $('uList').innerHTML = groups.flatMap(g => g.txs).sort(byOldest).map(tx => txCard(tx, { owedFirst: true, payBtn: true })).join('');
    return;
  }
  $('uList').innerHTML = groups.map(g => {
    const open = U.open.has(g.key) || groups.length === 1;
    const sub = [t('unpaid.orders', { n: g.txs.length }), t('unpaid.oldest', { a: ageLabel(g.oldest) })].join(' · ');
    const paid = round2(g.total - g.owed);
    return `<article class="cgroup${open ? ' open' : ''}" data-key="${escapeHtml(g.key)}">
      <div class="cg-head">
        <button type="button" class="cg-row" data-act="group" aria-expanded="${open}">
          <span class="cg-av">${escapeHtml((g.name.trim().charAt(0) || '?').toUpperCase())}</span>
          <span class="tx-main"><span class="tx-client">${escapeHtml(g.name)}</span><span class="tx-items">${escapeHtml(sub)}</span></span>
          <span class="tx-side"><span class="tx-total due">${fmtNum(g.owed)}</span>${paid > 0 ? `<span class="tx-meta">${escapeHtml(t('hist.paidOf', { p: fmtNum(paid), t: fmtNum(g.total) }))}</span>` : ''}</span>
          <span class="cg-chev">${ic('chevron-down')}</span>
        </button>
        <button type="button" class="btn btn-sm btn-save row-pay" data-act="paygroup">${ic('banknote')}<span>${t('pay.record')}</span></button>
      </div>
      ${open ? `<div class="cg-orders">${g.txs.map(tx => txCard(tx, { inGroup: true, owedFirst: true })).join('')}</div>` : ''}
    </article>`;
  }).join('');
}
$('uList').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const grp = btn.closest('.cgroup');
  if (grp && (btn.dataset.act === 'group' || btn.dataset.act === 'paygroup')) {
    const k = grp.dataset.key;
    if (btn.dataset.act === 'group') { U.open.has(k) ? U.open.delete(k) : U.open.add(k); renderUnpaid(); return; }
    const g = unpaidGroups().find(x => x.key === k);
    if (g) recordPayment(g.txs, g.name).catch(err => { console.error(err); toast(t('toast.saveErr'), { error: true }); }).then(renderUnpaid);
    return;
  }
  onTxListClick(e);
});
$('uView').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; U.view = c.dataset.view; setActiveChip($('uView'), 'view', U.view); renderUnpaid(); });
$('uSearch').addEventListener('input', debounce(renderUnpaid, 150));
pageRenderers.pageUnpaid = renderUnpaid;

/* ---------- merging two spellings of one client (admin) ---------- */
/* every client name seen, one spelling per merged client */
function mergeNames() {
  const seen = new Map();
  for (const tx of liveTx()) {
    const c = (tx.client || '').trim();
    if (isDefaultClient(c)) continue;
    const k = resolveClientKey(c);
    if (!seen.has(k)) seen.set(k, c);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, lang));
}
function renderMergeList() {
  const al = clientAliases(), keys = Object.keys(al);
  $('mergeList').innerHTML = keys.length ? `<h4 class="tx-sub">${t('merge.current')}</h4><ul class="merge-list">${keys.map(k => `<li><span>${escapeHtml(k)} → <b>${escapeHtml(al[k])}</b></span><button type="button" class="icon-btn sm ghost" data-undo="${escapeHtml(k)}" aria-label="${escapeHtml(t('merge.undo'))}">${ic('x')}</button></li>`).join('')}</ul>` : '';
}
async function saveAliases(al) {
  await store.saveCatalog({ ...(state.catalog || {}), clientAliases: al });
  refreshAfterData();
}
function openMerge() {
  if (state.role !== 'admin') return;
  $('mergeNames').innerHTML = mergeNames().map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
  $('mergeFrom').value = ''; $('mergeTo').value = ''; $('mergeErr').textContent = '';
  renderMergeList();
  const close = () => { closeOverlay('mergeOverlay'); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  $('mergeNo').onclick = close;
  $('mergeOverlay').onclick = e => { if (e.target === $('mergeOverlay')) close(); };
  $('mergeYes').onclick = async () => {
    const known = new Set(mergeNames().map(resolveClientKey));
    const from = $('mergeFrom').value.trim(), to = $('mergeTo').value.trim();
    const kf = resolveClientKey(from), kt = resolveClientKey(to);
    if (!from || !to || !known.has(kf) || !known.has(kt) || kf === kt) { $('mergeErr').textContent = t('merge.err'); return; }
    // the alias hangs on the end of the "from" chain, so merges never form a loop
    try { await saveAliases({ ...clientAliases(), [kf]: to }); toast(t('merge.done')); close(); }
    catch (err) { console.error(err); toast(t('toast.saveErr'), { error: true }); }
  };
  $('mergeList').onclick = async e => {
    const b = e.target.closest('[data-undo]'); if (!b) return;
    const al = { ...clientAliases() }; delete al[b.dataset.undo];
    try { await saveAliases(al); renderMergeList(); toast(t('merge.undone')); }
    catch (err) { console.error(err); toast(t('toast.saveErr'), { error: true }); }
  };
  openOverlay('mergeOverlay', 'mergeFrom');
}
$('uMerge').addEventListener('click', openMerge);

/* ==================== OPERATIONAL COSTS ==================== */
const X = { type: null, range: 'month' };
function updateExpBtn() {
  const otherOk = X.type !== 'other' || $('expOther').value.trim();
  $('expSave').disabled = !(X.type && parseFloat($('expAmount').value) > 0 && $('expDate').value && otherOk);
}
$('expTypes').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  X.type = c.dataset.exp;
  qsa('#expTypes .chip').forEach(x => x.classList.toggle('active', x === c));
  $('fExpOther').hidden = X.type !== 'other';
  (X.type === 'other' ? $('expOther') : $('expAmount')).focus();
  updateExpBtn();
});
['expAmount', 'expDate', 'expOther', 'expNote'].forEach(id => {
  $(id).addEventListener('input', updateExpBtn);
  $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (!$('expSave').disabled) $('expSave').click(); } });
});
$('expSave').addEventListener('click', async () => {
  if ($('expSave').disabled) return;
  $('expSave').disabled = true;
  const exp = {
    type: X.type,
    otherLabel: X.type === 'other' ? $('expOther').value.trim() : null,
    amount: round2(parseFloat($('expAmount').value) || 0),
    date: $('expDate').value,
    note: $('expNote').value.trim(),
    createdAt: new Date().toISOString(), createdBy: state.role, deviceId: state.deviceId,
  };
  try {
    await commit(store.addExp(exp));
    toast(t('oc.saved'));
    X.type = null;
    qsa('#expTypes .chip').forEach(x => x.classList.remove('active'));
    $('fExpOther').hidden = true;
    $('expOther').value = ''; $('expAmount').value = ''; $('expNote').value = '';
  } catch (err) {
    console.error(err);
    toast(t('toast.saveErr') + ': ' + ((err && err.message) || ''), { error: true, ms: 6000 });
  }
  updateExpBtn();
});
$('expRange').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; X.range = c.dataset.range; setActiveChip($('expRange'), 'range', X.range); renderExpenses(); });
function renderExpenses() {
  if (!$('expDate').value) $('expDate').value = todayStr();
  const rows = state.expenses.filter(ex => inRange(ex.date, X.range))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  $('expSummary').innerHTML = `<span>${t('oc.total')}</span><strong>${fmtMoney(rows.reduce((s, ex) => s + (ex.amount || 0), 0))}</strong>`;
  if (!rows.length) { $('expList').innerHTML = `<div class="empty">${ic('wallet')}<p>${t('oc.empty')}</p></div>`; return; }
  const isAdmin = state.role === 'admin';
  $('expList').innerHTML = rows.map(ex => `<article class="tx" data-id="${escapeHtml(ex.id)}">
    <div class="tx-row static">
      <span class="tx-ic">${ic(EXP_ICONS[ex.type] || 'pencil')}</span>
      <span class="tx-main"><span class="tx-client">${escapeHtml(expLabel(ex))}</span>${ex.note ? `<span class="tx-items">${escapeHtml(ex.note)}</span>` : ''}<span class="tx-meta">${escapeHtml(fmtDate(ex.date))} · ${t('role.' + (ex.createdBy === 'admin' ? 'admin' : 'employee'))}</span></span>
      <span class="tx-side"><span class="tx-total warn">${fmtNum(ex.amount || 0)}</span>${isAdmin ? `<button type="button" class="icon-btn sm ghost" data-act="delexp" aria-label="${escapeHtml(t('hist.delete'))}">${ic('trash-2')}</button>` : ''}</span>
    </div>
  </article>`).join('');
}
$('expList').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act="delexp"]'); if (!btn || state.role !== 'admin') return;
  const id = btn.closest('.tx').dataset.id;
  if (!(await askConfirm({ title: t('oc.delConfirm'), sub: t('confirm.delTxSub') }))) return;
  try { await commit(store.delExp(id)); toast(t('toast.deleted')); }
  catch (err) { console.error(err); toast(t('toast.saveErr'), { error: true }); }
  renderExpenses();
});
pageRenderers.pageExpenses = renderExpenses;

/* ==================== MACHINES ==================== */
function renderMachines() {
  const list = $('machList');
  if (!state.machines.length) { list.innerHTML = `<div class="empty">${ic('printer')}<p>${t('mach.empty')}</p></div>`; return; }
  // keep what is being typed when another device updates the list
  const typed = {};
  qsa('.mach', list).forEach(c => { typed[c.dataset.id] = { val: c.querySelector('[data-f="val"]').value, date: c.querySelector('[data-f="date"]').value }; });
  list.innerHTML = state.machines.map(m => {
    const recs = m.records || [];
    const last = recs[recs.length - 1];
    const hist = recs.slice(-5).reverse().map((r, i, arr) => {
      const diff = i < arr.length - 1 ? r.value - arr[i + 1].value : null;
      return `<li><span class="muted">${escapeHtml(fmtDate(r.date))}</span><b>${fmtInt(r.value)}</b><span class="diff">${diff != null ? (diff >= 0 ? '+' : '') + fmtInt(diff) : ''}</span></li>`;
    }).join('');
    return `<article class="panel mach" data-id="${escapeHtml(m.id)}">
      <div class="mach-head"><span class="mach-ic">${ic('printer')}</span><div><h3>${escapeHtml(m.name)}</h3>
        <p class="muted small">${last ? `${t('mach.last')}: <b>${fmtInt(last.value)}</b> · ${escapeHtml(fmtDate(last.date))}` : t('mach.never')}</p></div></div>
      <div class="row end">
        <div class="field"><label>${t('mach.new')}</label><input type="number" inputmode="numeric" min="0" data-f="val" placeholder="${last ? last.value : 0}"></div>
        <div class="field"><label>${t('mach.date')}</label><input type="date" data-f="date" value="${todayStr()}"></div>
        <button type="button" class="btn btn-primary" data-act="save">${t('mach.save')}</button>
      </div>
      <p class="mach-live small" data-f="live"></p>
      ${hist ? `<ul class="mach-hist">${hist}</ul>` : ''}
    </article>`;
  }).join('');
  qsa('.mach', list).forEach(c => {
    const v = typed[c.dataset.id]; if (!v) return;
    c.querySelector('[data-f="val"]').value = v.val;
    if (v.date) c.querySelector('[data-f="date"]').value = v.date;
    updateMachLive(c);
  });
}
function updateMachLive(card) {
  const m = state.machines.find(x => String(x.id) === card.dataset.id);
  const last = m && (m.records || []).slice(-1)[0];
  const v = parseInt(card.querySelector('[data-f="val"]').value, 10);
  const out = card.querySelector('[data-f="live"]');
  out.textContent = last && v > 0 ? t('mach.diff', { n: fmtInt(v - last.value) }).replace('+-', '−') : '';
  out.classList.toggle('bad', !!(last && v > 0 && v < last.value));
}
async function saveReading(card) {
  const id = card.dataset.id;
  const val = parseInt(card.querySelector('[data-f="val"]').value, 10);
  const date = card.querySelector('[data-f="date"]').value;
  if (!val || !date) { toast(t('toast.needBoth'), { error: true }); return; }
  const m = state.machines.find(x => String(x.id) === id); if (!m) return;
  const last = (m.records || []).slice(-1)[0];
  if (last && val < last.value && !(await askConfirm({ title: t('mach.lowerTitle'), sub: t('mach.lowerSub', { n: fmtInt(last.value) }), yes: t('mach.saveAnyway'), danger: false, icon: 'alert-triangle' }))) return;
  const machines = state.machines.map(x => x.id === m.id ? { ...x, records: [...(x.records || []), { value: val, date, at: new Date().toISOString() }] } : x);
  try {
    card.querySelector('[data-f="val"]').value = '';
    await commit(store.saveMachines(machines));
    toast(t('toast.readingSaved'));
  } catch (err) { console.error(err); toast(t('toast.saveErr'), { error: true }); }
  renderMachines();
}
$('machList').addEventListener('click', e => { const b = e.target.closest('[data-act="save"]'); if (b) saveReading(b.closest('.mach')); });
$('machList').addEventListener('input', e => { if (e.target.dataset.f === 'val') updateMachLive(e.target.closest('.mach')); });
$('machList').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.f) { e.preventDefault(); saveReading(e.target.closest('.mach')); } });
pageRenderers.pageMachines = renderMachines;
