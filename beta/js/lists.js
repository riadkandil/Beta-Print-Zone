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
    if (H.flags.has('unpaid') && (tx.payMethod !== 'notpaid' || tx.mistake)) return false;
    if (H.flags.has('mistake') && !tx.mistake) return false;
    return !q || txSearchText(tx).includes(q);
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
function renderHistory() {
  const rows = historyRows();
  const isAdmin = state.role === 'admin';
  const sum = $('hSummary');
  sum.hidden = !rows.length;
  const liveTotal = rows.reduce((s, tx) => s + (tx.mistake ? 0 : (tx.total || 0)), 0);
  sum.innerHTML = `<span>${t('hist.count', { n: rows.length })}</span>${isAdmin ? `<strong>${fmtMoney(liveTotal)}</strong>` : ''}`;
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
function txCard(tx) {
  const open = H.open.has(tx.id);
  const unpaid = tx.payMethod === 'notpaid';
  const badges = (tx.mistake ? `<span class="badge danger">${ic('alert-triangle')}${t('hist.mistake')}</span>` : '')
    + (unpaid ? `<span class="badge danger">${ic('clock')}${escapeHtml(payLabel(tx))}</span>` : '');
  const meta = [tx.createdAt ? fmtTime(tx.createdAt) : '', unpaid ? '' : payLabel(tx)].filter(Boolean).join(' · ');
  return `<article class="tx${tx.mistake ? ' mistake' : ''}${open ? ' open' : ''}" data-id="${escapeHtml(tx.id)}">
    <button type="button" class="tx-row" data-act="toggle" aria-expanded="${open}">
      <span class="tx-ic doc${unpaid ? ' due' : ''}">${ic('file-text')}</span>
      <span class="tx-main"><span class="tx-client">${escapeHtml(tx.client || '')}${badges}</span><span class="tx-items">${escapeHtml(txSummary(tx))}</span></span>
      <span class="tx-side"><span class="tx-total">${fmtNum(tx.total || 0)}</span><span class="tx-meta">${escapeHtml(meta)}</span></span>
    </button>
    ${open ? txDetail(tx) : ''}
  </article>`;
}
function txDetail(tx) {
  const isAdmin = state.role === 'admin';
  const rows = (tx.items || []).map(it => {
    const extra = (it.engLength > 0 ? ` <span class="muted">${it.engLength} ${t('eng.m')}</span>` : '') + (it.engNote ? ` <span class="muted">— ${escapeHtml(it.engNote)}</span>` : '');
    const price = it.isFinal ? t('inv.final') : fmtNum(it.price) + (it.engPerMeter ? ' / ' + t('eng.m') : '');
    return `<tr><td>${escapeHtml(itemTitle(it))}${extra}</td><td>${it.noQty ? '—' : it.qty}</td><td>${escapeHtml(price)}</td><td>${fmtNum(it.total)}</td></tr>`;
  }).join('');
  const acts = [];
  if (tx.payMethod === 'notpaid' && !tx.mistake) acts.push(`<button type="button" class="btn btn-sm btn-save" data-act="paid">${ic('check')}${t('unpaid.markPaid')}</button>`);
  if (isAdmin) acts.push(`<button type="button" class="btn btn-sm btn-ghost" data-act="edit">${ic('pencil')}${t('hist.edit')}</button>`);
  if (!isAdmin || tx.mistake) acts.push(`<button type="button" class="btn btn-sm btn-warn" data-act="mistake">${ic('alert-triangle')}${t(tx.mistake ? 'hist.unmarkMistake' : 'hist.markMistake')}</button>`);
  if (isAdmin) acts.push(`<button type="button" class="btn btn-sm btn-danger-soft" data-act="delete">${ic('trash-2')}${t('hist.delete')}</button>`);
  const meta = [t('hist.by') + ': ' + t('role.' + (tx.createdBy === 'admin' ? 'admin' : 'employee')), tx.editedAt ? t('hist.edited') : ''].filter(Boolean).join(' · ');
  return `<div class="tx-detail">
    <div class="table-wrap"><table class="items-table"><thead><tr><th>${t('th.item')}</th><th>${t('th.qty')}</th><th>${t('th.price')}</th><th>${t('th.total')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${tx.notes ? `<p class="tx-notes">${ic('sticky-note')} ${escapeHtml(tx.notes)}</p>` : ''}
    <p class="muted small">${escapeHtml(meta)}</p>
    <div class="tx-actions">${acts.join('')}</div>
  </div>`;
}

async function markPaid(tx) {
  const res = await askPayMethod(tx.client + ' · ' + fmtMoney(tx.total || 0));
  if (!res) return;
  await commit(store.updateTx(tx.id, { ...res, paidAt: new Date().toISOString() }));
  toast(t('toast.paid'));
}
async function txAction(act, tx) {
  try {
    if (act === 'paid') await markPaid(tx);
    else if (act === 'edit' && state.role === 'admin') await editTransaction(tx);
    else if (act === 'mistake') {
      if (tx.mistake) { await commit(store.updateTx(tx.id, { mistake: false })); toast(t('toast.mistakeUnmarked')); }
      else if (await askConfirm({ title: t('confirm.mistake'), sub: t('confirm.mistakeSub'), yes: t('confirm.mark'), danger: false, icon: 'alert-triangle' })) {
        await commit(store.updateTx(tx.id, { mistake: true }));
        toast(t('toast.mistakeMarked'));
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
function onTxListClick(e) {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  if (btn.dataset.act === 'showall') { H.range = 'all'; setActiveChip($('hRange'), 'range', 'all'); renderHistory(); return; }
  const card = btn.closest('.tx'); if (!card) return;
  const tx = state.transactions.find(x => String(x.id) === card.dataset.id); if (!tx) return;
  if (btn.dataset.act === 'toggle') { H.open.has(tx.id) ? H.open.delete(tx.id) : H.open.add(tx.id); renderHistory(); return; }
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
function renderUnpaid() {
  const rows = liveTx().filter(tx => tx.payMethod === 'notpaid').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const total = rows.reduce((s, tx) => s + (tx.total || 0), 0);
  $('uSummary').innerHTML = `<span>${t('unpaid.total')} · ${t('hist.count', { n: rows.length })}</span><strong>${fmtMoney(total)}</strong>`;
  if (!rows.length) { $('uList').innerHTML = `<div class="empty">${ic('check-circle')}<p>${t('unpaid.empty')}</p></div>`; return; }
  const today = new Date(todayStr() + 'T00:00:00');
  $('uList').innerHTML = rows.map(tx => {
    const days = Math.round((today - new Date(tx.date + 'T00:00:00')) / 86400000);
    const age = days <= 0 ? t('unpaid.today') : t('unpaid.daysAgo', { n: days });
    return `<article class="tx" data-id="${escapeHtml(tx.id)}">
      <div class="tx-row static">
        <span class="tx-ic doc due">${ic('file-text')}</span>
        <span class="tx-main"><span class="tx-client">${escapeHtml(tx.client || '')}</span><span class="tx-items">${escapeHtml(txSummary(tx))}</span><span class="tx-meta">${escapeHtml(fmtDate(tx.date))} · ${escapeHtml(age)}</span></span>
        <span class="tx-side"><span class="tx-total">${fmtNum(tx.total || 0)}</span><button type="button" class="btn btn-sm btn-save" data-act="paid">${ic('check')}${t('unpaid.markPaid')}</button></span>
      </div>
    </article>`;
  }).join('');
}
$('uList').addEventListener('click', e => {
  const btn = e.target.closest('[data-act="paid"]'); if (!btn) return;
  const tx = state.transactions.find(x => String(x.id) === btn.closest('.tx').dataset.id);
  if (tx) txAction('paid', tx);
});
pageRenderers.pageUnpaid = renderUnpaid;

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
