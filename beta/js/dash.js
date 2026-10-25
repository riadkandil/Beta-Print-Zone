'use strict';
/* ==================== DASHBOARD (admin) ==================== */
/* One period filter scopes the hero, the tiles and the four charts; the
   6-month chart below the "all records" heading is deliberately unscoped. */
const DS = { range: 'today', day: null, tables: new Set() };
const daysInMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const sumBy = (list, f) => list.reduce((s, x) => s + (x[f] || 0), 0);

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
function metrics(from, to) {
  const txs = liveTx().filter(tx => tx.date >= from && tx.date <= to);
  const exps = state.expenses.filter(e => e.date >= from && e.date <= to);
  const rev = sumBy(txs, 'total'), costs = sumBy(exps, 'amount');
  return {
    txs, exps, rev, costs, net: rev - costs, count: txs.length, avg: txs.length ? rev / txs.length : 0,
    unpaid: sumBy(txs.filter(tx => tx.payMethod === 'notpaid'), 'total'),
    eng: sumBy(txs, 'engMeters'), pieces: sumBy(txs, 'pieces'),
  };
}
/* Signed change vs the previous period; colour = direction × whether up is good, always with an arrow and text */
function deltaHtml(cur, prev, upIsGood, vsKey) {
  const vs = vsKey ? ' · ' + t(vsKey) : '';
  if (!prev) return `<span class="delta flat">${t('dash.noPrev')}</span>`;
  const pct = (cur - prev) / Math.abs(prev) * 100;
  if (Math.abs(pct) < 0.5) return `<span class="delta flat">${ic('minus')}0%${vs}</span>`;
  const up = pct > 0;
  return `<span class="delta ${up === upIsGood ? 'good' : 'bad'}">${ic(up ? 'arrow-up-right' : 'arrow-down-right')}${up ? '+' : '−'}${Math.round(Math.abs(pct))}%${vs}</span>`;
}
function tile(label, value, delta) {
  return `<div class="tile"><span class="tile-label">${escapeHtml(label)}</span><span class="tile-value">${value}</span>${delta || ''}</div>`;
}

/* ---------- chart pieces (HTML, no library) ---------- */
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
  const cols = cats.map((c, i) => `<div class="cc-col">${series.map(s => {
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
function topRows(map, n, otherLabel) {
  const all = Object.entries(map).map(([label, o]) => ({ label, value: o.value, count: o.count })).sort((a, b) => b.value - a.value);
  if (all.length <= n + 1) return all;
  const rest = all.slice(n);
  return [...all.slice(0, n), { label: otherLabel, value: sumBy(rest, 'value'), count: sumBy(rest, 'count') }];
}
function serviceGroup(it) {
  if (it.type === 'custom') return it.desc || svcLabel('custom');
  if (it.type === 'simple') return svcLabel(it.svc);
  return svcLabel(it.svc) + ' · ' + valLabel(it.op);
}

function renderDashboard() {
  if (state.role !== 'admin') return;
  const p = periodFor(DS.range);
  const cur = metrics(p.from, p.to), prev = metrics(p.prevFrom, p.prevTo);

  $('dHero').innerHTML = `<span class="hero-label">${t('dash.revenue')} · ${escapeHtml(periodLabel(p))}</span>
    <span class="hero-value">${fmtInt(cur.rev)}<small>${t('cur')}</small></span>
    ${deltaHtml(cur.rev, prev.rev, true, p.vs)}`;
  $('dTiles').innerHTML = [
    tile(t('dash.tx'), fmtInt(cur.count), deltaHtml(cur.count, prev.count, true)),
    tile(t('dash.avg'), fmtInt(cur.avg), deltaHtml(cur.avg, prev.avg, true)),
    tile(t('dash.costs'), fmtInt(cur.costs), deltaHtml(cur.costs, prev.costs, false)),
    tile(t('dash.net'), (cur.net < 0 ? '−' : '') + fmtInt(Math.abs(cur.net)), deltaHtml(cur.net, prev.net, true)),
    tile(t('dash.unpaid'), fmtInt(cur.unpaid)),
    tile(t('dash.eng'), round2(cur.eng).toLocaleString('en-US')),
    tile(t('dash.pieces'), fmtInt(cur.pieces)),
  ].join('');

  // revenue by hour (one day) or by day (a range)
  let cats, values;
  if (p.single) {
    const byHour = {};
    cur.txs.forEach(tx => { const h = tx.createdAt ? new Date(tx.createdAt).getHours() : 12; byHour[h] = (byHour[h] || 0) + (tx.total || 0); });
    const hours = Object.keys(byHour).map(Number);
    const lo = Math.min(9, ...hours), hi = Math.max(21, ...hours);
    cats = []; values = [];
    for (let h = lo; h <= hi; h++) {
      const lbl = new Date(2000, 0, 1, h).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', hour12: true });
      cats.push({ label: lbl, full: lbl }); values.push(byHour[h] || 0);
    }
  } else {
    const byDay = {};
    cur.txs.forEach(tx => { byDay[tx.date] = (byDay[tx.date] || 0) + (tx.total || 0); });
    cats = []; values = [];
    for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
      cats.push({ label: fmtDate(d, DS.range === 'week' ? { weekday: 'short' } : { day: 'numeric' }), full: fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' }) });
      values.push(byDay[d] || 0);
    }
  }
  chartCard('cTrend', t(p.single ? 'chart.byHour' : 'chart.byDay'), {
    empty: !cur.rev,
    chart: colChart(cats, [{ name: t('legend.revenue'), cls: 's1', values }]),
    head: [t('th.period'), t('legend.revenue')], rows: cats.map((c, i) => [c.full, fmtNum(values[i])]),
  });

  const svc = {};
  cur.txs.forEach(tx => (tx.items || []).forEach(it => { const k = serviceGroup(it); const o = svc[k] = svc[k] || { value: 0, count: 0 }; o.value += it.total || 0; o.count++; }));
  const svcRows = topRows(svc, 6, lang === 'ar' ? 'أخرى' : 'Other');
  chartCard('cSvc', t('chart.svc'), {
    empty: !svcRows.length,
    chart: hBars(svcRows.map(r => ({ label: r.label, sub: '(' + r.count + ')', value: r.value })), 's1'),
    head: [t('xh.svc'), t('th.jobs'), t('legend.revenue')], rows: svcRows.map(r => [r.label, String(r.count), fmtNum(r.value)]),
  });

  const pay = {};
  cur.txs.forEach(tx => { const k = payLabel(tx); const o = pay[k] = pay[k] || { value: 0, count: 0 }; o.value += tx.total || 0; o.count++; });
  const payRows = topRows(pay, 6, lang === 'ar' ? 'أخرى' : 'Other');
  chartCard('cPay', t('chart.pay'), {
    empty: !payRows.length,
    chart: hBars(payRows.map(r => ({ label: r.label, sub: '(' + r.count + ')', value: r.value })), 's1'),
    head: [t('xh.pay'), t('dash.tx'), t('legend.revenue')], rows: payRows.map(r => [r.label, String(r.count), fmtNum(r.value)]),
  });

  const cost = {};
  cur.exps.forEach(e => { const k = expLabel(e); const o = cost[k] = cost[k] || { value: 0, count: 0 }; o.value += e.amount || 0; o.count++; });
  const costRows = topRows(cost, 6, lang === 'ar' ? 'أخرى' : 'Other');
  chartCard('cCosts', t('chart.costs'), {
    empty: !costRows.length,
    chart: hBars(costRows.map(r => ({ label: r.label, value: r.value })), 's2'),
    head: [t('xh.type'), t('xh.amount')], rows: costRows.map(r => [r.label, fmtNum(r.value)]),
  });

  // last 6 months, all records
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) { const m = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(m.getFullYear() + '-' + pad2(m.getMonth() + 1)); }
  const revM = months.map(m => sumBy(liveTx().filter(tx => (tx.date || '').startsWith(m)), 'total'));
  const costM = months.map(m => sumBy(state.expenses.filter(e => (e.date || '').startsWith(m)), 'amount'));
  const mCats = months.map(m => { const l = fmtDate(m + '-01', { month: 'short', year: '2-digit' }); return { label: l, full: fmtDate(m + '-01', { month: 'long', year: 'numeric' }) }; });
  const mSeries = [{ name: t('legend.revenue'), cls: 's1', values: revM }, { name: t('legend.costs'), cls: 's2', values: costM }];
  chartCard('cMonths', t('chart.months'), {
    empty: !revM.some(Boolean) && !costM.some(Boolean),
    legend: legendHtml(mSeries),
    chart: colChart(mCats, mSeries),
    head: [t('th.period'), t('legend.revenue'), t('legend.costs'), t('th.net')],
    rows: mCats.map((c, i) => [c.full, fmtNum(revM[i]), fmtNum(costM[i]), fmtNum(revM[i] - costM[i])]),
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
  const b = e.target.closest('[data-table]'); if (!b) return;
  const id = b.dataset.table;
  DS.tables.has(id) ? DS.tables.delete(id) : DS.tables.add(id);
  renderDashboard();
});
pageRenderers.pageDashboard = renderDashboard;
