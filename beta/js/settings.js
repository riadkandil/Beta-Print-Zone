'use strict';
/* ==================== SETTINGS (admin) ==================== */

/* ---------- export ---------- */
function setExportRange(r) {
  const today = todayStr();
  if (r === 'today') { $('xFrom').value = today; $('xTo').value = today; }
  else if (r === 'month') { $('xFrom').value = today.slice(0, 8) + '01'; $('xTo').value = today; }
  else { $('xFrom').value = ''; $('xTo').value = today; }
  setActiveChip($('xRange'), 'range', r);
}
$('xRange').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) setExportRange(c.dataset.range); });
['xFrom', 'xTo'].forEach(id => $(id).addEventListener('input', () => setActiveChip($('xRange'), 'range', '')));

function exportData() {
  const from = $('xFrom').value, to = $('xTo').value, withMistakes = $('xMistakes').checked;
  const inR = d => (!from || d >= from) && (!to || d <= to);
  const byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  const txs = state.transactions.filter(tx => inR(tx.date) && (withMistakes || !tx.mistake)).sort(byDate);
  const exps = state.expenses.filter(e => inR(e.date)).sort(byDate);
  return { from, to, withMistakes, txs, exps };
}
function itemRow(tx, it, n, withMistakes) {
  const row = {
    [t('xh.no')]: n, [t('xh.date')]: tx.date, [t('xh.time')]: tx.createdAt ? fmtTime(tx.createdAt) : '',
    [t('xh.client')]: tx.client, [t('xh.by')]: t('role.' + (tx.createdBy === 'admin' ? 'admin' : 'employee')),
    [t('xh.pay')]: payLabel(tx), [t('xh.notes')]: tx.notes || '',
    [t('xh.svc')]: svcLabel(it.type === 'custom' ? 'custom' : it.svc),
    [t('xh.detail')]: it.type === 'paper' ? valLabel(it.op) : (it.desc || ''),
    [t('xh.color')]: it.color === '—' ? '' : valLabel(it.color),
    [t('xh.sides')]: it.face === '—' ? '' : valLabel(it.face),
    [t('xh.finish')]: it.finish === '—' ? '' : valLabel(it.finish),
    [t('xh.engLen')]: it.engLength || '', [t('xh.engNote')]: it.engNote || '',
    [t('xh.qty')]: it.noQty ? '' : it.qty, [t('xh.price')]: Number(it.price),
    [t('xh.final')]: it.isFinal ? t('yes') : t('no'), [t('xh.total')]: Number(it.total),
  };
  if (withMistakes) row[t('xh.mistake')] = tx.mistake ? t('yes') : '';
  return row;
}
const fileName = (from, to, ext) => `PrintZone_${from || 'all'}_${to || todayStr()}.${ext}`;

$('xXlsx').addEventListener('click', () => {
  const { from, to, withMistakes, txs, exps } = exportData();
  if (!txs.length && !exps.length) { toast(t('toast.expNone'), { error: true }); return; }
  const live = txs.filter(tx => !tx.mistake);
  const wb = XLSX.utils.book_new();
  if (lang === 'ar') wb.Workbook = { Views: [{ RTL: true }] };

  const rows = [];
  txs.forEach((tx, i) => (tx.items || []).forEach(it => rows.push(itemRow(tx, it, i + 1, withMistakes))));
  const grand = sumBy(live, 'total'), pieces = sumBy(live, 'pieces'), costs = sumBy(exps, 'amount');
  rows.push({});
  rows.push({ [t('xh.notes')]: t('xh.grand'), [t('xh.qty')]: pieces, [t('xh.total')]: round2(grand) });
  const ws1 = XLSX.utils.json_to_sheet(rows);
  ws1['!cols'] = [5, 11, 9, 18, 10, 12, 22, 14, 14, 9, 11, 9, 13, 16, 8, 10, 10, 12, 8].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, t('sheet.tx'));

  const svcAgg = {};
  live.forEach(tx => (tx.items || []).forEach(it => {
    const k = it.type === 'custom' ? (it.desc || svcLabel('custom')) : svcLabel(it.svc);
    const o = svcAgg[k] = svcAgg[k] || { qty: 0, rev: 0 };
    o.qty += it.noQty ? 0 : (it.qty || 0); o.rev += it.total || 0;
  }));
  const sumRows = [
    [t('sum.period'), (from || '…') + ' → ' + (to || '…')],
    [t('sum.generated'), new Date().toLocaleString(locale())],
    [],
    [t('sum.rev'), round2(grand) + ' ' + t('cur')],
    [t('sum.tx'), live.length],
    [t('sum.pieces'), pieces],
    [t('sum.clients'), new Set(live.map(tx => tx.client)).size],
    [t('sum.eng'), round2(sumBy(live, 'engMeters')) + ' ' + t('eng.m')],
    [t('sum.costs'), round2(costs) + ' ' + t('cur')],
    [t('sum.net'), round2(grand - costs) + ' ' + t('cur')],
    [],
    [t('sum.bySvc')],
    [t('sum.svcCol'), t('sum.qtyCol'), t('sum.revCol')],
    ...Object.entries(svcAgg).sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => [k, v.qty, round2(v.rev)]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
  ws2['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, t('sheet.sum'));

  const machRows = [];
  state.machines.forEach(m => (m.records || []).forEach((r, i, arr) => {
    if ((from && r.date < from) || (to && r.date > to)) return;
    machRows.push({ [t('xh.machine')]: m.name, [t('xh.date')]: r.date, [t('xh.reading')]: r.value, [t('xh.diff')]: i > 0 ? r.value - arr[i - 1].value : '' });
  }));
  if (machRows.length) {
    const ws3 = XLSX.utils.json_to_sheet(machRows);
    ws3['!cols'] = [{ wch: 20 }, { wch: 11 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws3, t('sheet.mach'));
  }
  if (exps.length) {
    const expRows = exps.map((e, i) => ({ [t('xh.no')]: i + 1, [t('xh.date')]: e.date, [t('xh.type')]: expLabel(e), [t('xh.notes')]: e.note || '', [t('xh.by')]: t('role.' + (e.createdBy === 'admin' ? 'admin' : 'employee')), [t('xh.amount')]: Number(e.amount) }));
    expRows.push({});
    expRows.push({ [t('xh.notes')]: t('xh.grand'), [t('xh.amount')]: round2(costs) });
    const ws4 = XLSX.utils.json_to_sheet(expRows);
    ws4['!cols'] = [{ wch: 5 }, { wch: 11 }, { wch: 20 }, { wch: 26 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws4, t('sheet.exp'));
  }
  XLSX.writeFile(wb, fileName(from, to, 'xlsx'));
  toast(t('toast.expDone'));
});

$('xCsv').addEventListener('click', () => {
  const { from, to, withMistakes, txs } = exportData();
  if (!txs.length) { toast(t('toast.expNone'), { error: true }); return; }
  const esc = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [];
  txs.forEach((tx, i) => (tx.items || []).forEach(it => rows.push(itemRow(tx, it, i + 1, withMistakes))));
  const head = Object.keys(rows[0]);
  const csv = [head.map(esc).join(','), ...rows.map(r => head.map(h => esc(r[h])).join(','))].join('\r\n');
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), fileName(from, to, 'csv'));
  toast(t('toast.expDone'));
});
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- backup (same file format as the classic app) ---------- */
$('bkExport').addEventListener('click', () => {
  const data = { version: 1, exportedAt: new Date().toISOString(), transactions: state.transactions, machines: state.machines, expenses: state.expenses };
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `printzone-backup-${todayStr()}.json`);
  toast(t('toast.backupDone'));
});
$('bkImport').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.transactions)) throw new Error('no transactions');
    const txIds = new Set(state.transactions.map(x => String(x.id)));
    const expIds = new Set(state.expenses.map(x => String(x.id)));
    const txs = data.transactions.filter(x => x && x.id && !txIds.has(String(x.id)));
    const exps = (Array.isArray(data.expenses) ? data.expenses : []).filter(x => x && x.id && !expIds.has(String(x.id)));
    await store.importRecords(txs, exps);
    // machines are only restored in local mode, as in the classic app, so live counters are never overwritten
    if (!state.online && Array.isArray(data.machines) && data.machines.length) await store.saveMachines(data.machines);
    toast(t('toast.restoreDone', { n: txs.length + exps.length }));
  } catch (err) {
    console.error(err);
    toast(t('toast.restoreErr'), { error: true });
  }
  e.target.value = '';
});

/* ---------- passwords ---------- */
$('pwEmpBtn').addEventListener('click', async () => {
  const v = $('pwEmp').value;
  if (!v || v.length < 4) { toast(t('toast.pwShort'), { error: true }); return; }
  const s = { ...state.settings, empHash: await hashPw(v) };
  await store.saveSettings(s); state.settings = s;
  $('pwEmp').value = '';
  toast(t('toast.pwChanged'));
});
$('pwAdminBtn').addEventListener('click', async () => {
  if (await hashPw($('pwCur').value) !== state.settings.adminHash) { toast(t('toast.pwWrong'), { error: true }); return; }
  const v = $('pwAdmin').value;
  if (!v || v.length < 4) { toast(t('toast.pwShort'), { error: true }); return; }
  const s = { ...state.settings, adminHash: await hashPw(v) };
  await store.saveSettings(s); state.settings = s;
  $('pwCur').value = ''; $('pwAdmin').value = '';
  toast(t('toast.pwChanged'));
});

/* ---------- machines ---------- */
function renderMachSettings() {
  $('msList').innerHTML = state.machines.map(m => `<div class="ms-row" data-id="${escapeHtml(m.id)}">
    <input value="${escapeHtml(m.name)}" data-f="name" autocomplete="off" aria-label="${escapeHtml(t('machset.name'))}">
    <button type="button" class="icon-btn" data-act="save" aria-label="${escapeHtml(t('mach.save'))}">${ic('check')}</button>
    <button type="button" class="icon-btn danger" data-act="del" aria-label="${escapeHtml(t('hist.delete'))}">${ic('trash-2')}</button>
  </div>`).join('');
}
async function saveMachineList(machines) {
  try { await store.saveMachines(machines); toast(t('toast.machSaved')); }
  catch (err) { console.error(err); toast(t('toast.saveErr'), { error: true }); }
  renderMachSettings();
}
$('msList').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const row = b.closest('.ms-row'), id = row.dataset.id;
  if (b.dataset.act === 'save') {
    const name = row.querySelector('[data-f="name"]').value.trim(); if (!name) return;
    await saveMachineList(state.machines.map(m => m.id === id ? { ...m, name } : m));
  } else if (await askConfirm({ title: t('machset.delConfirm'), sub: t('machset.delConfirmSub') })) {
    await saveMachineList(state.machines.filter(m => m.id !== id));
  }
});
async function addMachine() {
  const name = $('msNew').value.trim(); if (!name) return;
  $('msNew').value = '';
  await saveMachineList([...state.machines, { id: 'm' + Date.now(), name, order: state.machines.length + 1, records: [] }]);
}
$('msAdd').addEventListener('click', addMachine);
$('msNew').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addMachine(); } });

/* ---------- product lists ---------- */
function renderCatalog() {
  const cat = state.catalog || {};
  $('catEditor').innerHTML = CATALOG_SVCS.map(svc => {
    const items = cat[svc] || [];
    return `<div class="cat-block" data-svc="${svc}">
      <h3 class="cat-title">${ic(SVC_ICONS[svc])} ${escapeHtml(svcLabel(svc))} <span class="muted">(${items.length})</span></h3>
      <div class="cat-items">${items.length ? items.map((x, i) => `<span class="cat-chip">${escapeHtml(x)}<button type="button" data-del="${i}" aria-label="${escapeHtml(t('hist.delete'))}">${ic('x')}</button></span>`).join('') : `<span class="muted small">${t('cat.empty')}</span>`}</div>
      <div class="row end"><div class="field"><input data-f="new" autocomplete="off" placeholder="${escapeHtml(t('cat.addPh'))}"></div><button type="button" class="btn btn-ghost" data-act="add">${ic('plus')}${t('cat.add')}</button></div>
    </div>`;
  }).join('');
}
async function saveCatalog(cat) {
  try { await store.saveCatalog(cat); toast(t('toast.catSaved')); }
  catch (err) { console.error(err); toast(t('toast.saveErr'), { error: true }); }
  renderCatalog();
}
function catalogCopy() { const c = state.catalog || {}; return { ...c, books: [...(c.books || [])], office: [...(c.office || [])] }; }
$('catEditor').addEventListener('click', e => {
  const block = e.target.closest('.cat-block'); if (!block) return;
  const svc = block.dataset.svc;
  const del = e.target.closest('[data-del]');
  if (del) { const cat = catalogCopy(); cat[svc].splice(+del.dataset.del, 1); saveCatalog(cat); return; }
  if (e.target.closest('[data-act="add"]')) addCatalogItem(block);
});
$('catEditor').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.f === 'new') { e.preventDefault(); addCatalogItem(e.target.closest('.cat-block')); } });
function addCatalogItem(block) {
  const input = block.querySelector('[data-f="new"]');
  const name = input.value.trim(); if (!name) return;
  const cat = catalogCopy(), svc = block.dataset.svc;
  if (!cat[svc].includes(name)) cat[svc].push(name);
  saveCatalog(cat);
}

pageRenderers.pageSettings = function renderSettings() {
  if (state.role !== 'admin') return;
  if (!$('xTo').value) setExportRange('month');
  renderMachSettings();
  renderCatalog();
  $('aboutVer').textContent = APP_VERSION + ' · ' + (state.online ? t('status.online') : t('status.local'));
};
