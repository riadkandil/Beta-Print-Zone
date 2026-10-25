'use strict';
/* ==================== DASHBOARD (admin) ==================== */
/* One period filter scopes the KPIs, the insights and every chart; the
   12-month chart below the "all records" heading is deliberately unscoped. */
const DS = { range: 'today', day: null, tables: new Set() };
const daysInMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const sumBy = (list, f) => list.reduce((s, x) => s + (x[f] || 0), 0);
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
const isDark = () => document.documentElement.classList.contains('dark');
const otherLabel = () => (lang === 'ar' ? 'أخرى' : 'Other');
const DEFAULT_CLIENTS = () => new Set([I18N.en['newtx.defaultClient'], I18N.ar['newtx.defaultClient'], '']);

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
function metrics(from, to) {
  const txs = liveTx().filter(tx => tx.date >= from && tx.date <= to);
  const exps = state.expenses.filter(e => e.date >= from && e.date <= to);
  const rev = sumBy(txs, 'total'), costs = sumBy(exps, 'amount');
  return {
    txs, exps, rev, costs, net: rev - costs, count: txs.length, avg: txs.length ? rev / txs.length : 0,
    unpaid: sumBy(txs.filter(tx => tx.payMethod === 'notpaid'), 'total'),
    engJobs: txs.reduce((n, tx) => n + (tx.items || []).filter(it => it.svc === 'eng').length, 0), pieces: sumBy(txs, 'pieces'),
  };
}
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
/* Part-to-whole: one 100% bar with a 2px gap between segments, and a legend that carries every value */
function shareBar(rows) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const segs = rows.filter(r => r.value > 0).map(r => `<span class="share-seg ${r.cls}" style="flex:${r.value}" tabindex="0" data-tip-v="${escapeHtml(fmtMoney(r.value))}" data-tip-l="${escapeHtml(r.label + ' · ' + Math.round(r.value / total * 100) + '%')}"></span>`).join('');
  const legend = rows.map(r => `<div class="share-row"><i class="key ${r.cls}"></i><span class="share-name">${escapeHtml(r.label)}</span><span class="share-pct">${Math.round(r.value / total * 100)}%</span><span class="share-val">${fmtInt(r.value)}</span></div>`).join('');
  return `<div class="share-bar">${segs}</div><div class="share-legend">${legend}</div>`;
}
/* Weekday × hour grid, one blue ramp light→dark by order count */
const HEAT_LIGHT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
const HEAT_DARK = ['#184f95', '#256abf', '#3987e5', '#5598e7', '#86b6ef', '#b7d3f6'];
function heatmap(grid, hours, max) {
  const ramp = isDark() ? HEAT_DARK : HEAT_LIGHT;
  const step = v => (v ? ramp[Math.min(ramp.length - 1, Math.floor((v / max) * (ramp.length - 0.001)))] : '');
  const hourLbl = h => new Date(2000, 0, 1, h).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', hour12: true });
  const rows = grid.map((row, wd) => `<span class="hm-day">${escapeHtml(weekdayName(wd))}</span>${hours.map(h => {
    const v = row[h] || 0;
    return `<span class="hm-cell${v ? '' : ' zero'}" style="${v ? 'background:' + step(v) : ''}" tabindex="0" data-tip-v="${v} ${escapeHtml(t('th.orders'))}" data-tip-l="${escapeHtml(weekdayName(wd) + ' · ' + hourLbl(h))}"></span>`;
  }).join('')}`).join('');
  const every = hours.length > 12 ? 2 : 1;
  const xl = hours.map((h, i) => `<span>${i % every === 0 ? escapeHtml(hourLbl(h)) : ''}</span>`).join('');
  return `<div class="hm" style="--cols:${hours.length}">${rows}<span></span>${xl}</div>
    <div class="hm-scale"><span>${t('heat.fewer')}</span>${ramp.map(c => `<i style="background:${c}"></i>`).join('')}<span>${t('heat.more')}</span></div>`;
}
/* weekday 0 = Saturday, the first day of the shop's week */
function weekdayName(wd) { return new Date(2000, 0, 1 + wd).toLocaleDateString(locale(), { weekday: 'short' }); }
const shopWeekday = date => (new Date(date + 'T00:00:00').getDay() + 1) % 7;
/* A small trend line for the revenue card */
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

/* Revenue over the period: by hour for one day, by day up to two months, by month beyond */
function trendSeries(p, txs) {
  const cats = [], values = [];
  if (p.single) {
    const byHour = {};
    txs.forEach(tx => { const h = tx.createdAt ? new Date(tx.createdAt).getHours() : 12; byHour[h] = (byHour[h] || 0) + (tx.total || 0); });
    const hours = Object.keys(byHour).map(Number);
    const lo = Math.min(9, ...hours), hi = Math.max(21, ...hours);
    for (let h = lo; h <= hi; h++) {
      const lbl = new Date(2000, 0, 1, h).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', hour12: true });
      cats.push({ label: lbl, full: lbl }); values.push(byHour[h] || 0);
    }
    return { cats, values, title: 'chart.byHour' };
  }
  if (dayDiff(p.from, p.to) > 62) {
    const byMonth = {};
    txs.forEach(tx => { const m = (tx.date || '').slice(0, 7); byMonth[m] = (byMonth[m] || 0) + (tx.total || 0); });
    for (let m = p.from.slice(0, 7); m <= p.to.slice(0, 7);) {
      cats.push({ label: fmtDate(m + '-01', { month: 'short' }), full: fmtDate(m + '-01', { month: 'long', year: 'numeric' }) });
      values.push(byMonth[m] || 0);
      const d = new Date(m + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); m = dateKey(d).slice(0, 7);
    }
    return { cats, values, title: 'chart.byMonth' };
  }
  const byDay = {};
  txs.forEach(tx => { byDay[tx.date] = (byDay[tx.date] || 0) + (tx.total || 0); });
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
    cats.push({ label: fmtDate(d, DS.range === 'week' ? { weekday: 'short' } : { day: 'numeric' }), full: fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' }) });
    values.push(byDay[d] || 0);
  }
  return { cats, values, title: 'chart.byDay' };
}

function renderDashboard() {
  if (state.role !== 'admin') return;
  const p = periodFor(DS.range);
  const cur = metrics(p.from, p.to), prev = metrics(p.prevFrom, p.prevTo);
  const trend = trendSeries(p, cur.txs);

  /* ----- KPIs ----- */
  $('dKpis').innerHTML = `<div class="kpi hero">
      <span class="kpi-label">${t('dash.revenue')} · ${escapeHtml(periodLabel(p))}</span>
      <span class="hero-value">${fmtInt(cur.rev)}<small>${t('cur')}</small></span>
      <span class="hero-vs">${deltaHtml(cur.rev, prev.rev, true)}<span class="muted small">${t(p.vs)}</span></span>
      ${sparkline(trend.values)}
    </div>` + [
    kpi('receipt-text', 'blue', t('dash.tx'), fmtInt(cur.count), deltaHtml(cur.count, prev.count, true)),
    kpi('calculator', 'violet', t('dash.avg'), fmtInt(cur.avg), deltaHtml(cur.avg, prev.avg, true)),
    kpi('wallet', 'orange', t('dash.costs'), fmtInt(cur.costs), deltaHtml(cur.costs, prev.costs, false)),
    kpi('trending-up', 'green', t('dash.net'), signed(cur.net), deltaHtml(cur.net, prev.net, true)),
    kpi('hourglass', 'red', t('dash.unpaid'), fmtInt(cur.unpaid)),
    kpi('drafting-compass', 'amber', t('dash.engJobs'), fmtInt(cur.engJobs), deltaHtml(cur.engJobs, prev.engJobs, true)),
  ].join('');

  /* ----- insights: plain-language facts about the period ----- */
  const ins = [];
  if (!p.single && cur.rev) {
    const byDay = {};
    cur.txs.forEach(tx => { byDay[tx.date] = (byDay[tx.date] || 0) + (tx.total || 0); });
    const [bd, bv] = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    ins.push(['trophy', t('ins.bestDay'), fmtDate(bd, { weekday: 'short', day: 'numeric', month: 'short' }), fmtMoney(bv)]);
  }
  if (cur.count) {
    const byHour = {};
    cur.txs.forEach(tx => { if (tx.createdAt) { const h = new Date(tx.createdAt).getHours(); byHour[h] = (byHour[h] || 0) + 1; } });
    const top = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const h = +top[0], fmtH = x => new Date(2000, 0, 1, x).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', hour12: true });
      ins.push(['clock', t('ins.peak'), fmtH(h) + ' – ' + fmtH((h + 1) % 24), top[1] + ' ' + t('th.orders')]);
    }
  }
  const svc = {};
  cur.txs.forEach(tx => (tx.items || []).forEach(it => { const k = serviceGroup(it); const o = svc[k] = svc[k] || { value: 0, count: 0 }; o.value += it.total || 0; o.count++; }));
  const svcRows = topRows(svc, 6);
  if (svcRows.length && cur.rev) ins.push(['star', t('ins.topSvc'), svcRows[0].label, t('ins.share', { p: Math.round(svcRows[0].value / cur.rev * 100) })]);
  const defaults = DEFAULT_CLIENTS();
  const clients = {};
  cur.txs.forEach(tx => { const c = (tx.client || '').trim(); if (defaults.has(c)) return; const o = clients[c] = clients[c] || { value: 0, count: 0 }; o.value += tx.total || 0; o.count++; });
  const clientRows = Object.entries(clients).map(([label, o]) => ({ label, ...o })).sort((a, b) => b.value - a.value).slice(0, 7);
  if (clientRows.length) ins.push(['user-round', t('ins.topClient'), clientRows[0].label, fmtMoney(clientRows[0].value)]);
  if (cur.pieces) ins.push(['printer', t('ins.pieces'), fmtInt(cur.pieces), '']);
  const open = liveTx().filter(tx => tx.payMethod === 'notpaid');
  if (open.length) ins.push(['hourglass', t('ins.openUnpaid'), String(open.length), fmtMoney(sumBy(open, 'total'))]);
  $('dInsights').innerHTML = ins.map(([icon, label, value, sub]) => `<div class="insight"><span class="insight-ic">${ic(icon)}</span><span class="insight-txt"><span class="insight-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${sub ? `<span class="insight-sub">${escapeHtml(sub)}</span>` : ''}</span></div>`).join('');
  $('dInsights').hidden = !ins.length;

  /* ----- charts ----- */
  chartCard('cTrend', t(trend.title), {
    empty: !cur.rev,
    chart: colChart(trend.cats, [{ name: t('legend.revenue'), cls: 's1', values: trend.values }]),
    head: [t('th.period'), t('legend.revenue')], rows: trend.cats.map((c, i) => [c.full, fmtNum(trend.values[i])]),
  });

  const mix = {};
  cur.txs.forEach(tx => (tx.items || []).forEach(it => { const c = itemCat(it); mix[c] = (mix[c] || 0) + (it.total || 0); }));
  const mixRows = CAT_ORDER.map((c, i) => ({ label: t('cat.' + c), value: mix[c] || 0, cls: 'k' + (i + 1) }));
  const mixTotal = mixRows.reduce((s, r) => s + r.value, 0);
  chartCard('cMix', t('chart.mix'), {
    empty: !mixTotal,
    chart: shareBar(mixRows),
    head: [t('xh.svc'), t('th.share'), t('legend.revenue')], rows: mixRows.map(r => [r.label, Math.round(r.value / (mixTotal || 1) * 100) + '%', fmtNum(r.value)]),
  });

  chartCard('cSvc', t('chart.svc'), {
    empty: !svcRows.length,
    chart: hBars(svcRows.map(r => ({ label: r.label, sub: '(' + r.count + ')', value: r.value })), 's1'),
    head: [t('xh.svc'), t('th.jobs'), t('legend.revenue')], rows: svcRows.map(r => [r.label, String(r.count), fmtNum(r.value)]),
  });

  // busy times: a single day is too thin for a weekly pattern, so it looks at the 4 weeks ending that day
  const heatFrom = p.single ? addDays(p.to, -27) : p.from;
  const heatTx = liveTx().filter(tx => tx.date >= heatFrom && tx.date <= p.to && tx.createdAt);
  const grid = Array.from({ length: 7 }, () => ({}));
  let hLo = 9, hHi = 21, hMax = 0;
  heatTx.forEach(tx => {
    const h = new Date(tx.createdAt).getHours(), row = grid[shopWeekday(tx.date)];
    row[h] = (row[h] || 0) + 1;
    hMax = Math.max(hMax, row[h]); hLo = Math.min(hLo, h); hHi = Math.max(hHi, h);
  });
  const hours = []; for (let h = hLo; h <= hHi; h++) hours.push(h);
  chartCard('cHeat', t(p.single ? 'chart.heat28' : 'chart.heat'), {
    empty: !heatTx.length,
    chart: heatmap(grid, hours, hMax),
    head: [t('th.day'), ...hours.map(h => String(h))], rows: grid.map((row, wd) => [weekdayName(wd), ...hours.map(h => String(row[h] || 0))]),
  });

  chartCard('cClients', t('chart.clients'), {
    empty: !clientRows.length,
    chart: hBars(clientRows.map(r => ({ label: r.label, sub: '(' + r.count + ')', value: r.value })), 's1'),
    head: [t('newtx.client'), t('th.orders'), t('legend.revenue')], rows: clientRows.map(r => [r.label, String(r.count), fmtNum(r.value)]),
  });

  const pay = {};
  cur.txs.forEach(tx => { const k = payLabel(tx); const o = pay[k] = pay[k] || { value: 0, count: 0 }; o.value += tx.total || 0; o.count++; });
  const payRows = topRows(pay, 6);
  chartCard('cPay', t('chart.pay'), {
    empty: !payRows.length,
    chart: hBars(payRows.map(r => ({ label: r.label, sub: '(' + r.count + ')', value: r.value })), 's1'),
    head: [t('xh.pay'), t('dash.tx'), t('legend.revenue')], rows: payRows.map(r => [r.label, String(r.count), fmtNum(r.value)]),
  });

  const cost = {};
  cur.exps.forEach(e => { const k = expLabel(e); const o = cost[k] = cost[k] || { value: 0, count: 0 }; o.value += e.amount || 0; o.count++; });
  const costRows = topRows(cost, 6);
  chartCard('cCosts', t('chart.costs'), {
    empty: !costRows.length,
    chart: hBars(costRows.map(r => ({ label: r.label, value: r.value })), 's2'),
    head: [t('xh.type'), t('xh.amount')], rows: costRows.map(r => [r.label, fmtNum(r.value)]),
  });

  // last 12 months, all records
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) { const m = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(m.getFullYear() + '-' + pad2(m.getMonth() + 1)); }
  const revM = months.map(m => sumBy(liveTx().filter(tx => (tx.date || '').startsWith(m)), 'total'));
  const costM = months.map(m => sumBy(state.expenses.filter(e => (e.date || '').startsWith(m)), 'amount'));
  const mCats = months.map(m => { const l = fmtDate(m + '-01', { month: 'short' }); return { label: l, full: fmtDate(m + '-01', { month: 'long', year: 'numeric' }) }; });
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
