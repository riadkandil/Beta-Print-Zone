/* DEMO BUILD ONLY: everything this page stores is prefixed with "pzdemo:", so the demo never shares a
   sign-in, settings or local data with the real app served from the same site. */
(function () {
  const P = 'pzdemo:', S = Storage.prototype, get = S.getItem, set = S.setItem, del = S.removeItem;
  S.getItem = function (k) { return get.call(this, P + k); };
  S.setItem = function (k, v) { return set.call(this, P + k, v); };
  S.removeItem = function (k) { return del.call(this, P + k); };
})();
/* DEMO COPY ONLY (not part of the app): fills sample orders on the first visit and signs in automatically.
   URL options: ?role=employee, ?login=1 (show the login page), plus test helpers page / svc / op / add / open / probe. */
(function () {
  const q = new URLSearchParams(location.search);
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
  const mk = (i, day, client, total, pay, svc) => ({ id: 't' + i, date: d(day), client, total, payMethod: pay, createdAt: new Date(Date.now() - day * 86400000 - i * 3600000).toISOString(), items: [{ type: 'paper', svc, op: 'print', color: 'black', face: 'one', finish: 'normal', qty: 10, price: total / 10, total }] });
  // v2 seed: adds v3.2 cases (part-payments, an old debt, name variants, a late payment, costs)
  if (localStorage.getItem('pz_seed') !== '3' && !q.get('noseed')) {
    const tx = []; let i = 0;
    for (let day = 0; day < 40; day++) for (let k = 0; k < (day % 3) + 2; k++) tx.push(mk(i++, day, ['Ahmed Ali', 'Sara', 'Omar', 'Mona', 'عميل'][i % 5], 20 + (i * 37) % 300, ['cash', 'instapay', 'notpaid', 'vodafone', 'cash'][i % 5], ['A4', 'A3', 'eng', 'A5'][i % 4]));
    const iso = n => new Date(Date.now() - n * 86400000).toISOString();
    tx.push({ ...mk(900, 5, 'أحمد علي', 200, 'notpaid', 'A4') });
    tx.push({ ...mk(901, 12, 'احمد  علي ', 150, 'notpaid', 'A3'), payments: [{ amount: 50, method: 'cash', other: null, date: d(3), at: iso(3), by: 'employee' }] });
    tx.push({ ...mk(902, 150, 'Mona', 500, 'notpaid', 'eng') });
    tx.push({ ...mk(903, 20, 'Omar', 260, 'instapay', 'A4'), paidAt: iso(2) });
    tx.push({ ...mk(904, 1, 'Sara', 90, 'notpaid', 'A5'), mistake: true });
    // a varied mix for the service breakdown: copy, colour, two sides, scans, writing items, office supplies, other services
    const P = (svc, op, color, face, finish, qty, total, noQty) => ({ type: 'paper', svc, op, color, face, finish, qty, price: total / qty, total, ...(noQty ? { noQty: true } : {}) });
    const S = (svc, desc, qty, total) => ({ type: 'simple', svc, desc, qty, price: total / qty, total });
    const mix = [
      [P('A4', 'copy', 'black', 'two', 'normal', 200, 100), P('A4', 'print', 'color', 'one', 'glossy', 20, 80), P('A4', 'scan', '—', '—', '—', 1, 15, true)],
      [S('office', 'Folder', 3, 30), S('contract', '', 1, 50), S('wrap', '', 4, 20)],
      [{ type: 'custom', svc: 'custom', desc: 'Binding', qty: 1, price: 40, total: 40 }, P('A3', 'copy', 'color', 'one', 'normal', 10, 60)],
      [S('poa', '', 1, 70), S('writing', '', 2, 40), S('upload', '', 1, 25), P('eng', 'copy', '—', '—', '—', 3, 90)],
      [P('A5', 'copy', 'black', 'one', 'normal', 50, 25), S('office', 'Pen', 5, 25), P('eng', 'scan', '—', '—', '—', 1, 20, true)],
    ];
    for (let day = 0; day < 30; day++) mix.forEach((items, j) => { if ((day + j) % 2 === 0) tx.push({ ...mk(1000 + day * 10 + j, day, ['Ahmed Ali', 'Sara', 'Mona'][j % 3], 0, 'cash', 'A4'), items, total: items.reduce((s, it) => s + it.total, 0) }); });
    localStorage.setItem('pz_tx', JSON.stringify(tx));
    localStorage.setItem('pz_exp', JSON.stringify([
      { id: 'e1', type: 'electricity', amount: 350, date: d(0), createdAt: iso(0), createdBy: 'admin' },
      { id: 'e2', type: 'inventory', amount: 1200, date: d(4), createdAt: iso(4), createdBy: 'admin' },
      { id: 'e3', type: 'salaries', amount: 3000, date: d(15), createdAt: iso(15), createdBy: 'admin' },
    ]));
    localStorage.setItem('pz_seed', '3');
  }
  if (q.get('login')) sessionStorage.removeItem('pz_session');
  else if (q.get('role') || !sessionStorage.getItem('pz_session')) sessionStorage.setItem('pz_session', q.get('role') || 'admin');
  ['lang', 'theme', 'nav', 'dark', 'light'].forEach(k => { if (q.get(k)) localStorage.setItem(k === 'lang' ? 'pz_lang' : 'pz_beta_' + k, q.get(k)); });
  window.addEventListener('load', () => setTimeout(() => {
    if (q.get('page')) go(q.get('page'));
    if (q.get('add')) q.get('add').split(',').forEach(s => { selectSvc(s); $('bPrice').value = 12; $('bPrice').dispatchEvent(new Event('input')); addFromBuilder(); });
    if (q.get('svc')) selectSvc(q.get('svc'), q.get('op'));
    if (q.get('open')) q.get('open').split('|').forEach(sel => document.querySelector(sel).click());
    if (q.get('scroll')) document.querySelector(q.get('scroll')).scrollIntoView({ block: 'start' });
    if (q.get('probe')) {
      const W = document.documentElement.clientWidth, out = [];
      document.querySelectorAll('#appView *').forEach(el => {
        if (el.closest('.sidebar') || el.closest('.cat-tabs')) return;
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > W + 1 || r.left < -1)) out.push(String(el.className).split(' ')[0] + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      });
      const main = document.querySelector('.main'), fits = el => el.scrollHeight <= el.clientHeight + 1;
      const fit = 'mainFits=' + fits(main) + ' docScroll=' + (document.documentElement.scrollHeight > innerHeight + 1) + ' sidebarFits=' + fits(document.querySelector('.sidebar'));
      const pre = document.createElement('pre'); pre.textContent = 'PROBE W=' + W + ' scrollW=' + document.documentElement.scrollWidth + ' ' + fit + '\n' + out.join('\n') + '\nENDPROBE'; document.body.appendChild(pre);
    }
  }, 700));
})();
