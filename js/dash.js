'use strict';
/* ==================== DASHBOARD (admin) ==================== */
/* One period filter scopes the KPIs, the insights, the charts and the daily report.
   Sales count orders on their own date; Collected counts money on the day it came in;
   Outstanding is what is owed right now, whatever the period. Net = Collected − Costs. */
const DS = { range: 'today', day: null, tables: new Set() };
const daysInMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const sumBy = (list, f) => list.reduce((s, x) => s + (x[f] || 0), 0);
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
const otherLabel = () => (lang === 'ar' ? 'أخرى' : 'Other');

function periodFor(range) {
  const today = todayStr();
  const d = new Date(today + 'T00:00:00');
  const oneDay = day => ({ from: day, to: day, prevFrom: addDays(day, -1), prevTo: addDays(day, -1), vs: 'vs.prevDay', single: true });
  if (range === 'today') return oneDay(today);
  if (range === 'yesterday') return oneDay(addDays(today, -1));
  if (range === 'day') return oneDay(DS.day || today);
  if (range === 'week') return { from: addDays(today, -6), to: today, prevFrom: addDays(today, -13), prevTo: addDays(today, -7), vs: 'vs.prev7' };
  if (range === 'month') {
    const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(d.getDate(), daysInMonth(prevStart)));
    return { from: today.slice(0, 8) + '01', to: today, prevFrom: dateKey(prevStart), prevTo: dateKey(prevEnd), vs: 'vs.prevMonthSpan' };
  }
  if (range === 'year') {
    const y = d.getFullYear();
    return { from: y + '-01-01', to: today, prevFrom: (y - 1) + '-01-01', prevTo: (y - 1) + today.slice(4), vs: 'vs.prevYear' };
  }
  // last month
  return {
    from: dateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: dateKey(new Date(d.getFullYear(), d.getMonth(), 0)),
    prevFrom: dateKey(new Date(d.getFullYear(), d.getMonth() - 2, 1)), prevTo: dateKey(new Date(d.getFullYear(), d.getMonth() - 1, 0)),
    vs: 'vs.prevMonth',
  };
}
function periodLabel(p) {
  if (p.from === p.to) return fmtDay(p.from);
  return fmtDate(p.from, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(p.to, { day: 'numeric', month: 'short', year: 'numeric' });
}
/* Every amount received, with the day it came in and the day of its order */
const allCollections = memoTx(() => liveTx().flatMap(tx => collections(tx).map(c => ({ ...c, txDate: tx.date }))));
function metrics(from, to) {
  const inR = d => d >= from && d <= to;
  const txs = liveTx().filter(tx => inR(tx.date));
  const cols = allCollections().filter(c => inR(c.date));
  const exps = state.expenses.filter(e => inR(e.date));
  const sales = round2(sumBy(txs, 'total')), collected = round2(sumBy(cols, 'amount')), costs = round2(sumBy(exps, 'amount'));
  return { txs, cols, exps, sales, collected, costs, net: round2(collected - costs), count: txs.length, avg: txs.length ? sales / txs.length : 0, pieces: sumBy(txs, 'pieces') };
}
const outstandingNow = () => round2(liveTx().reduce((s, tx) => s + owed(tx), 0));

/* One row per day (per month past two months): orders, sales, money in by method, costs and net */
const PAY_KEYS = ['cash', 'instapay', 'vodafone', 'other'];
const REP_SUMS = ['orders', 'sales', ...PAY_KEYS, 'collected', 'costs'];
function dailyReport(from, to) {
  const byMonth = dayDiff(from, to) > 62;
  const slot = d => (byMonth ? d.slice(0, 7) : d);
  const rows = new Map();
  const row = k => { if (!rows.has(k)) rows.set(k, Object.fromEntries([['key', k], ...REP_SUMS.map(f => [f, 0])])); return rows.get(k); };
  for (let d = from; d <= to; d = addDays(d, 1)) row(slot(d));
  const m = metrics(from, to);
  m.txs.forEach(tx => { const r = row(slot(tx.date)); r.orders++; r.sales += tx.total || 0; });
  m.cols.forEach(c => { const r = row(slot(c.date)); r[PAY_KEYS.includes(c.method) ? c.method : 'other'] += c.amount; r.collected += c.amount; });
  m.exps.forEach(e => { row(slot(e.date)).costs += e.amount || 0; });
  const total = Object.fromEntries([['key', ''], ...REP_SUMS.map(f => [f, 0])]);
  const list = [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
  list.forEach(r => {
    REP_SUMS.forEach(f => { r[f] = round2(r[f]); total[f] = round2(total[f] + r[f]); });
    r.net = round2(r.collected - r.costs);
  });
  total.net = round2(total.collected - total.costs);
  return { byMonth, rows: list, total };
}
const repLabel = (rep, k, long) => (rep.byMonth ? fmtDate(k + '-01', { month: long ? 'long' : 'short', year: 'numeric' }) : fmtDate(k, { weekday: 'short', day: 'numeric', month: 'short' }));
const repHead = rep => [t(rep.byMonth ? 'th.month' : 'th.day'), t('th.orders'), t('legend.sales'), ...PAY_KEYS.map(k => PAY_LABELS[k][lang]), t('legend.collected'), t('legend.costs'), t('th.net')];
const repCells = r => [r.orders, r.sales, ...PAY_KEYS.map(k => r[k]), r.collected, r.costs, r.net];

/* Signed change vs the previous period; colour = direction × whether up is good, always with an arrow and text */
function deltaHtml(cur, prev, upIsGood) {
  if (!prev) return `<span class="delta flat">${t('dash.noPrev')}</span>`;
  const pct = (cur - prev) / Math.abs(prev) * 100;
  if (Math.abs(pct) < 0.5) return `<span class="delta flat">${ic('minus')}0%</span>`;
  const up = pct > 0;
  return `<span class="delta ${up === upIsGood ? 'good' : 'bad'}">${ic(up ? 'arrow-up-right' : 'arrow-down-right')}${up ? '+' : '−'}${Math.round(Math.abs(pct))}%</span>`;
}
function kpi(icon, tone, label, value, delta) {
  return `<div class="kpi"><span class="kpi-ic ${tone}">${ic(icon)}</span><span class="kpi-label">${escapeHtml(label)}</span><span class="kpi-value">${value}</span>${delta || ''}</div>`;
}
const signed = n => (n < 0 ? '−' : '') + fmtInt(Math.abs(n));

/* ---------- chart pieces (HTML/SVG, no library) ---------- */
/* Four equal steps of a round size, so every tick is a clean number */
function niceMax(v) {
  if (v <= 0) return 4;
  const raw = v / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.max(1, [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(x => raw / p <= x) * p);
  return step * 4;
}
/* Columns grow from one baseline. series: [{name, cls, values[]}]. A single series labels only its peak and its last value. */
function colChart(cats, series) {
  const top = niceMax(Math.max(0, ...series.flatMap(s => s.values)));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const single = series.length === 1;
  const labelled = new Set();
  if (single) {
    const v = series[0].values;
    let peak = 0; v.forEach((x, i) => { if (x > v[peak]) peak = i; });
    if (v[peak] > 0) labelled.add(peak);
    for (let i = v.length - 1; i >= 0; i--) if (v[i] > 0) { labelled.add(i); break; }
  }
  const every = cats.length > 16 ? Math.ceil(cats.length / 10) : 1;
  const cols = cats.map((c, i) => `<div class="cc-col${c.mark ? ' mark' : ''}">${series.map(s => {
    const v = s.values[i] || 0;
    const tipL = c.full + (single ? '' : ' · ' + s.name);
    return `<div class="cc-bar ${s.cls}" style="height:${(v / top * 100).toFixed(2)}%" tabindex="0" data-tip-v="${escapeHtml(fmtMoney(v))}" data-tip-l="${escapeHtml(tipL)}">${labelled.has(i) ? `<span class="cc-val">${fmtCompact(v)}</span>` : ''}</div>`;
  }).join('')}</div>`).join('');
  const xl = cats.map((c, i) => `<span>${i % every === 0 || i === cats.length - 1 ? escapeHtml(c.label) : ''}</span>`).join('');
  return `<div class="cc">
    <div class="cc-y">${ticks.map(f => `<span style="bottom:${f * 100}%">${fmtCompact(top * f)}</span>`).join('')}</div>
    <div class="cc-main">
      <div class="cc-area">${ticks.map(f => `<i class="cc-grid" style="bottom:${f * 100}%"></i>`).join('')}<div class="cc-cols${single ? '' : ' grouped'}">${cols}</div></div>
      <div class="cc-xl">${xl}</div>
    </div>
  </div>`;
}
/* Horizontal bars, one colour per chart, value at the tip in text ink */
function hBars(rows, cls) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<div class="hb">${rows.map(r => `<div class="hb-row" tabindex="0" data-tip-v="${escapeHtml(fmtMoney(r.value))}" data-tip-l="${escapeHtml(r.label + (r.sub ? ' · ' + r.sub : ''))}">
    <span class="hb-label">${escapeHtml(r.label)}${r.sub ? ` <span class="muted">${escapeHtml(r.sub)}</span>` : ''}</span>
    <span class="hb-track"><span class="hb-bar ${cls}" style="--w:${(r.value / max).toFixed(4)}"></span><span class="hb-val">${fmtInt(r.value)}</span></span>
  </div>`).join('')}</div>`;
}
/* Part-to-whole: one 100% bar with a 2px gap between segments, and a legend that carries every value */
function shareBar(rows) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const segs = rows.filter(r => r.value > 0).map(r => `<span class="share-seg ${r.cls}" style="flex:${r.value}" tabindex="0" data-tip-v="${escapeHtml(fmtMoney(r.value))}" data-tip-l="${escapeHtml(r.label + ' · ' + Math.round(r.value / total * 100) + '%')}"></span>`).join('');
  const legend = rows.map(r => `<div class="share-row"><i class="key ${r.cls}"></i><span class="share-name">${escapeHtml(r.label)}</span><span class="share-pct">${Math.round(r.value / total * 100)}%</span><span class="share-val">${fmtInt(r.value)}</span></div>`).join('');
  return `<div class="share-bar">${segs}</div><div class="share-legend">${legend}</div>`;
}
/* A small trend line for the sales card */
function sparkline(values) {
  if (values.length < 2 || !values.some(Boolean)) return '';
  const w = 160, h = 40, max = Math.max(...values) || 1;
  const pts = values.map((v, i) => [i / (values.length - 1) * w, h - 3 - v / max * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${w} ${h} L0 ${h} Z" class="spark-fill"/><path d="${d}" class="spark-line"/></svg>`;
}
function tableHtml(head, rows) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${head.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function legendHtml(series) {
  return `<div class="legend">${series.map(s => `<span><i class="key ${s.cls}"></i>${escapeHtml(s.name)}</span>`).join('')}</div>`;
}
/* Every chart has a table twin, toggled from its header */
function chartCard(id, title, { chart, head, rows, legend, empty }) {
  const asTable = DS.tables.has(id);
  const toggle = empty ? '' : `<button type="button" class="link-btn" data-table="${id}">${ic(asTable ? 'bar-chart-3' : 'table-2')}${t(asTable ? 'chart.chart' : 'chart.table')}</button>`;
  const body = empty ? `<div class="empty sm"><p>${t('dash.nodata')}</p></div>` : asTable ? tableHtml(head, rows) : (legend || '') + chart;
  $(id).innerHTML = `<div class="cc-head"><h3>${escapeHtml(title)}</h3>${toggle}</div>${body}`;
}
/* Top N then "Other" so a chart never grows past 7 rows */
function topRows(map, n) {
  const all = Object.entries(map).map(([label, o]) => ({ label, value: o.value, count: o.count })).sort((a, b) => b.value - a.value);
  if (all.length <= n + 1) return all;
  const rest = all.slice(n);
  return [...all.slice(0, n), { label: otherLabel(), value: sumBy(rest, 'value'), count: sumBy(rest, 'count') }];
}
function serviceGroup(it) {
  if (it.type === 'custom') return it.desc || svcLabel('custom');
  if (it.type === 'simple') return svcLabel(it.svc);
  return svcLabel(it.svc) + ' · ' + valLabel(it.op);
}
const CAT_ORDER = ['print', 'eng', 'shop', 'extra'];
const itemCat = it => (SVC_DEF[it.svc] ? SVC_DEF[it.svc].cat : 'extra');

/* Sales and money collected over time, by day; a single day shows the two weeks up to it */
const trendFrom = p => (p.single ? addDays(p.to, -13) : p.from);
function trendSeries(p) {
  const rep = dailyReport(trendFrom(p), p.to);
  const cats = rep.rows.map(r => rep.byMonth
    ? { label: fmtDate(r.key + '-01', { month: 'short' }), full: repLabel(rep, r.key, true) }
    : { label: fmtDate(r.key, DS.range === 'week' ? { weekday: 'short' } : { day: 'numeric' }), full: repLabel(rep, r.key), mark: p.single && r.key === p.to });
  return { cats, sales: rep.rows.map(r => r.sales), collected: rep.rows.map(r => r.collected), title: rep.byMonth ? 'chart.byMonth' : p.single ? 'chart.byDay14' : 'chart.byDay' };
}
/* The report table: zero days are dimmed, a negative net is red, and several rows get a total line */
function reportTable(rep) {
  const num = (v, i) => (i === 0 ? fmtInt(v) : fmtNum(v));
  const tr = (label, r, cls) => `<tr class="${cls || ''}"><td>${escapeHtml(label)}</td>${repCells(r).map((v, i) => `<td class="${i === repCells(r).length - 1 && v < 0 ? 'neg' : ''}">${num(v, i)}</td>`).join('')}</tr>`;
  const body = rep.rows.map(r => tr(repLabel(rep, r.key), r, r.orders || r.collected || r.costs ? '' : 'zero')).join('');
  const foot = rep.rows.length > 1 ? `<tfoot>${tr(t('rep.total'), rep.total, 'total')}</tfoot>` : '';
  return `<div class="table-wrap report"><table class="data-table"><thead><tr>${repHead(rep).map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}
function exportReport() {
  const p = periodFor(DS.range), rep = dailyReport(p.from, p.to);
  const wb = XLSX.utils.book_new();
  if (lang === 'ar') wb.Workbook = { Views: [{ RTL: true }] };
  const aoa = [repHead(rep), ...rep.rows.map(r => [r.key, ...repCells(r)]), [t('rep.total'), ...repCells(rep.total)]];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [12, 8, 12, 12, 12, 12, 12, 12, 12, 12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, t('sheet.daily'));
  XLSX.writeFile(wb, `PrintZone_report_${p.from}_${p.to}.xlsx`);
  toast(t('toast.expDone'));
}

function renderDashboard() {
  if (state.role !== 'admin') return;
  const p = periodFor(DS.range);
  // ranges older than the live window are fetched first; the page re-renders when they arrive
  const loading = loadOlder(p.prevFrom < trendFrom(p) ? p.prevFrom : trendFrom(p));
  $('dLoading').hidden = !loading;
  $('dBody').hidden = loading;
  if (loading) return;
  const cur = metrics(p.from, p.to), prev = metrics(p.prevFrom, p.prevTo);
  const trend = trendSeries(p);
  const outstanding = outstandingNow();

  /* ----- KPIs ----- */
  $('dKpis').innerHTML = `<div class="kpi hero">
      <span class="kpi-label">${t('dash.sales')} · ${escapeHtml(periodLabel(p))}</span>
      <span class="hero-value">${fmtInt(cur.sales)}<small>${t('cur')}</small></span>
      <span class="hero-vs">${deltaHtml(cur.sales, prev.sales, true)}<span class="muted small">${t(p.vs)}</span></span>
      ${sparkline(trend.sales)}
    </div>` + [
    kpi('banknote', 'green', t('dash.collected'), fmtInt(cur.collected), deltaHtml(cur.collected, prev.collected, true)),
    kpi('hourglass', 'red', t('dash.outstanding'), fmtInt(outstanding)),
    kpi('wallet', 'orange', t('dash.costs'), fmtInt(cur.costs), deltaHtml(cur.costs, prev.costs, false)),
    kpi('trending-up', 'green', t('dash.net'), signed(cur.net), deltaHtml(cur.net, prev.net, true)),
    kpi('receipt-text', 'blue', t('dash.tx'), fmtInt(cur.count), deltaHtml(cur.count, prev.count, true)),
    kpi('calculator', 'violet', t('dash.avg'), fmtInt(cur.avg), deltaHtml(cur.avg, prev.avg, true)),
  ].join('');

  /* ----- insights: plain-language facts about the period ----- */
  const ins = [];
  if (!p.single && cur.sales) {
    const byDay = {};
    cur.txs.forEach(tx => { byDay[tx.date] = (byDay[tx.date] || 0) + (tx.total || 0); });
    const [bd, bv] = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    ins.push(['trophy', t('ins.bestDay'), fmtDate(bd, { weekday: 'short', day: 'numeric', month: 'short' }), fmtMoney(bv)]);
  }
  const svc = {};
  cur.txs.forEach(tx => (tx.items || []).forEach(it => { const k = serviceGroup(it); const o = svc[k] = svc[k] || { value: 0, count: 0 }; o.value += it.total || 0; o.count++; }));
  const svcRows = topRows(svc, 6);
  if (svcRows.length && cur.sales) ins.push(['star', t('ins.topSvc'), svcRows[0].label, t('ins.share', { p: Math.round(svcRows[0].value / cur.sales * 100) })]);
  // money that came in for orders taken before the period, and what this period's orders still owe
  const debtIn = round2(sumBy(cur.cols.filter(c => c.txDate < p.from), 'amount'));
  if (debtIn) ins.push(['hand-coins', t('ins.debtIn'), fmtMoney(debtIn), '']);
  const newDebt = round2(cur.txs.reduce((s, tx) => s + owed(tx), 0));
  if (newDebt) ins.push(['clock', t('ins.newDebt'), fmtMoney(newDebt), '']);
  if (cur.pieces) ins.push(['printer', t('ins.pieces'), fmtInt(cur.pieces), '']);
  const open = liveTx().filter(tx => owed(tx) > 0);
  if (open.length) ins.push(['hourglass', t('ins.openUnpaid'), String(open.length), fmtMoney(outstanding)]);
  $('dInsights').innerHTML = ins.map(([icon, label, value, sub]) => `<div class="insight"><span class="insight-ic">${ic(icon) || ic('circle')}</span><span class="insight-txt"><span class="insight-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${sub ? `<span class="insight-sub">${escapeHtml(sub)}</span>` : ''}</span></div>`).join('');
  $('dInsights').hidden = !ins.length;

  /* ----- charts ----- */
  const series = [{ name: t('legend.sales'), cls: 's1', values: trend.sales }, { name: t('legend.collected'), cls: 's3', values: trend.collected }];
  chartCard('cTrend', t(trend.title), {
    empty: !trend.sales.some(Boolean) && !trend.collected.some(Boolean),
    legend: legendHtml(series),
    chart: colChart(trend.cats, series),
    head: [t('th.period'), t('legend.sales'), t('legend.collected')], rows: trend.cats.map((c, i) => [c.full, fmtNum(trend.sales[i]), fmtNum(trend.collected[i])]),
  });

  const rep = dailyReport(p.from, p.to);
  const hasRep = rep.total.orders || rep.total.collected || rep.total.costs;
  $('cDaily').innerHTML = `<div class="cc-head"><h3>${escapeHtml(t(rep.byMonth ? 'chart.monthly' : 'chart.daily'))}</h3>${hasRep ? `<button type="button" class="link-btn" data-report="xlsx">${ic('download')}${t('rep.export')}</button>` : ''}</div>`
    + (hasRep ? reportTable(rep) : `<div class="empty sm"><p>${t('dash.nodata')}</p></div>`);

  const mix = {};
  cur.txs.forEach(tx => (tx.items || []).forEach(it => { const c = itemCat(it); mix[c] = (mix[c] || 0) + (it.total || 0); }));
  const mixRows = CAT_ORDER.map((c, i) => ({ label: t('cat.' + c), value: mix[c] || 0, cls: 'k' + (i + 1) }));
  const mixTotal = mixRows.reduce((s, r) => s + r.value, 0);
  chartCard('cMix', t('chart.mix'), {
    empty: !mixTotal,
    chart: shareBar(mixRows),
    head: [t('xh.svc'), t('th.share'), t('legend.sales')], rows: mixRows.map(r => [r.label, Math.round(r.value / (mixTotal || 1) * 100) + '%', fmtNum(r.value)]),
  });

  chartCard('cSvc', t('chart.svc'), {
    empty: !svcRows.length,
    chart: hBars(svcRows.map(r => ({ label: r.label, sub: '(' + r.count + ')', value: r.value })), 's1'),
    head: [t('xh.svc'), t('th.jobs'), t('legend.sales')], rows: svcRows.map(r => [r.label, String(r.count), fmtNum(r.value)]),
  });

  const pay = {};
  cur.cols.forEach(c => {
    const k = c.method === 'other' ? c.other || PAY_LABELS.other[lang] : PAY_LABELS[c.method] ? PAY_LABELS[c.method][lang] : c.method;
    const o = pay[k] = pay[k] || { value: 0, count: 0 }; o.value += c.amount; o.count++;
  });
  const payRows = topRows(pay, 6);
  chartCard('cPay', t('chart.pay'), {
    empty: !payRows.length,
    chart: hBars(payRows.map(r => ({ label: r.label, sub: '(' + r.count + ')', value: r.value })), 's3'),
    head: [t('xh.pay'), t('hist.payments'), t('legend.collected')], rows: payRows.map(r => [r.label, String(r.count), fmtNum(r.value)]),
  });

  const cost = {};
  cur.exps.forEach(e => { const k = expLabel(e); const o = cost[k] = cost[k] || { value: 0, count: 0 }; o.value += e.amount || 0; o.count++; });
  const costRows = topRows(cost, 6);
  chartCard('cCosts', t('chart.costs'), {
    empty: !costRows.length,
    chart: hBars(costRows.map(r => ({ label: r.label, value: r.value })), 's2'),
    head: [t('xh.type'), t('xh.amount')], rows: costRows.map(r => [r.label, fmtNum(r.value)]),
  });
}
$('dRange').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  DS.range = c.dataset.range;
  setActiveChip($('dRange'), 'range', DS.range);
  $('dDay').value = '';
  renderDashboard();
});
$('dDay').addEventListener('change', () => {
  if (!$('dDay').value) return;
  DS.range = 'day'; DS.day = $('dDay').value;
  setActiveChip($('dRange'), 'range', '');
  renderDashboard();
});
$('pageDashboard').addEventListener('click', e => {
  if (e.target.closest('[data-report]')) { exportReport(); return; }
  const b = e.target.closest('[data-table]'); if (!b) return;
  const id = b.dataset.table;
  DS.tables.has(id) ? DS.tables.delete(id) : DS.tables.add(id);
  renderDashboard();
});
pageRenderers.pageDashboard = renderDashboard;
