'use strict';
/* ════════════════════════════════════════════════════════════════════
   Print Zone — BETA
   Uses the same Firebase project and the same data format as the classic
   app in the parent folder, so both versions can be used side by side.
   ════════════════════════════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD61YUt3vqmWnBVtmcMcgzjDMaboXeDZG8",
  authDomain: "print-zone-35a7a.firebaseapp.com",
  projectId: "print-zone-35a7a",
  storageBucket: "print-zone-35a7a.firebasestorage.app",
  messagingSenderId: "365695169107",
  appId: "1:365695169107:web:159c4f1ad6283c38928ca6"
};
const APP_VERSION = 'v2.6 beta';
/* Defaults used only when the database has no passwords yet (same as the classic app) */
const DEFAULT_EMP_PW = '1234';
const DEFAULT_ADMIN_PW = 'mkmass45';

/* ==================== HELPERS ==================== */
const $ = id => document.getElementById(id);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad2 = n => String(n).padStart(2, '0');
const dateKey = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const todayStr = () => dateKey(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return dateKey(d); };
const round2 = n => Math.round((n || 0) * 100) / 100;
const finePointer = !!(window.matchMedia && matchMedia('(pointer:fine)').matches);
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }

/* Icons: built straight from lucide's data so dynamic HTML needs no re-scan */
const iconCache = {};
function ic(name, cls) {
  const key = name + '|' + (cls || '');
  if (iconCache[key] !== undefined) return iconCache[key];
  const pascal = name.replace(/(^|-)([a-z0-9])/g, (m, a, b) => b.toUpperCase());
  const node = window.lucide && lucide.icons && lucide.icons[pascal];
  if (!node) return (iconCache[key] = '');
  const attrs = o => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');
  const kids = node[2].map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
  return (iconCache[key] = `<svg ${attrs(node[1])} class="icon${cls ? ' ' + cls : ''}" aria-hidden="true">${kids}</svg>`);
}
function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-lucide]').forEach(el => { const html = ic(el.dataset.lucide, el.className); if (html) el.outerHTML = html; });
}

/* Pure-JS SHA-256 fallback (when crypto.subtle is unavailable) — identical to the classic app */
function sha256Sync(ascii) {
  function rightRotate(v, a) { return (v >>> a) | (v << (32 - a)); }
  let maxWord = Math.pow(2, 32), result = '';
  const words = [], asciiBitLength = ascii.length * 8;
  let hash = sha256Sync.h = sha256Sync.h || [], k = sha256Sync.k = sha256Sync.k || [];
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) return;
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0);
  words[words.length] = (asciiBitLength);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16), oldHash = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i]
        + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
  }
  return result;
}
async function hashPw(pw) {
  const data = 'pz::' + pw;
  try {
    if (crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* fall through */ }
  return sha256Sync(unescape(encodeURIComponent(data)));
}

/* ==================== I18N ==================== */
const I18N = {
  en: {
    'app.tag': 'Printing store transaction recorder',
    'login.employee': 'Employee', 'login.employeeSub': 'Record transactions',
    'login.admin': 'Admin', 'login.adminSub': 'Dashboard, export & settings',
    'login.password': 'Password', 'login.enter': 'Sign in',
    'login.wrong': 'Incorrect password', 'login.enterPw': 'Enter the password',
    'mode.local': 'Local mode — data stays on this device only.',
    'loading.connecting': 'Connecting…',
    'err.scripts': 'The Firebase libraries could not load — check the internet connection and reload the page.',
    'err.auth': 'Firebase refused the connection: Anonymous sign-in is not enabled in the Firebase console.',
    'err.rules': 'Firebase refused the connection: the security rules block access.',
    'err.notfound': 'The Firestore database does not exist yet.',
    'err.generic': 'Connection error',
    'beta.classic': 'Classic version', 'theme': 'Light / dark', 'logout': 'Sign out',
    'status.online': 'Online', 'status.offline': 'Offline — will sync', 'status.local': 'Local',
    'role.employee': 'Employee', 'role.admin': 'Admin',
    'nav.new': 'New', 'nav.history': 'History', 'nav.unpaid': 'Unpaid', 'nav.expenses': 'Costs',
    'nav.machines': 'Machines', 'nav.dashboard': 'Dashboard', 'nav.settings': 'Settings',
    'toast.loginOk': 'Signed in ✓',

    'cat.search': 'Search services…', 'cat.all': 'All', 'cat.print': 'Printing', 'cat.eng': 'Engineering',
    'cat.shop': 'Stationery', 'cat.extra': 'Services', 'cat.none': 'No service matches your search',
    'svcsub.A4': 'Print · copy · scan', 'svcsub.A3': 'Print · copy · scan', 'svcsub.A5': 'Print · copy · scan',
    'svcsub.eng': 'Plans & large prints', 'svcsub.books': 'Books & notebooks', 'svcsub.office': 'Pens, files…',
    'svcsub.pads': 'Pad binding', 'svcsub.wrap': 'Laminating', 'svcsub.upload': 'Online forms', 'svcsub.custom': 'Anything else',
    'b.close': 'Close', 'b.addSave': 'Add & place order',
    'page.new': 'New order', 'pos.services': 'Services', 'side.today': 'Today', 'pricing.total': 'Total price',
    'svcsub.contract': 'Stationery', 'svcsub.poa': 'Stationery', 'svcsub.writing': 'Stationery',
    'th.title': 'Themes', 'th.desc': 'Pick the shade of blue for light and dark mode on this device.', 'th.light': 'Light', 'th.dark': 'Dark',
    'lt.classic': 'Classic', 'lt.sky': 'Sky', 'lt.ocean': 'Ocean', 'lt.navy': 'Navy', 'lt.steel': 'Steel', 'lt.indigo': 'Indigo',
    'dt.midnight': 'Midnight', 'dt.navy': 'Navy', 'dt.ocean': 'Ocean', 'dt.steel': 'Steel', 'dt.royal': 'Royal', 'dt.abyss': 'Abyss',
    'side.orders': 'Orders', 'side.ordersSub': 'Yesterday: {n}', 'opb.print': 'Print', 'opb.copy': 'Copy', 'opb.scan': 'Scan',
    'nav.toggle': 'Show / hide menu', 'nav.menu': 'Menu', 'nav.admin': 'Admin', 'nav.collapse': 'Collapse', 'dash.engJobs': 'Engineering jobs', 'newtx.clientPh': 'Client name (optional)', 'sum.items': 'Items', 'order.no': 'Order #{n} today',
    'b.title': 'Add an item', 'b.edit': 'Edit item', 'b.reset': 'Reset',
    'b.item': 'Product', 'desc.optional': 'Description (optional)', 'custom.name': 'Service name',
    'b.isTotal': 'Price is the total for all pieces', 'b.lineTotal': 'Line total',
    'b.lastPrice': 'Last price used', 'b.update': 'Update', 'add': 'Add', 'b.editLine': 'Edit this item',
    'b.err.price': 'Enter a price', 'b.err.length': 'Enter the length', 'b.err.desc': 'Enter a name', 'b.err.qty': 'Quantity must be 1 or more',
    'svc.section': 'Service', 'op.section': 'Operation', 'color.section': 'Color', 'face.section': 'Sides', 'finish.section': 'Finish',
    'eng.pricing': 'Pricing', 'eng.perMeter': 'Per meter', 'eng.fixed': 'Fixed price',
    'eng.length': 'Length (m)', 'eng.note': 'Note', 'eng.notePh': 'e.g. floor plan…', 'eng.m': 'm',
    'qty': 'Quantity', 'price.unit': 'Price per piece', 'price.total': 'Total price', 'price.job': 'Price', 'price.meter': 'Price per meter',
    'inv.title': 'Current order', 'inv.clear': 'Clear', 'inv.empty': 'No items selected', 'inv.emptySub': 'Pick a service to get started', 'inv.total': 'Total', 'inv.final': 'total price',
    'newtx.client': 'Client', 'newtx.optional': 'Optional', 'newtx.addNote': 'Note', 'newtx.notesPh': 'Any extra details…', 'newtx.defaultClient': 'Client',
    'pay.section': 'Payment', 'pay.otherPh': 'e.g. Bank transfer…',
    'save.tx': 'Place order', 'save.update': 'Update transaction', 'save.short': 'Save',
    'toast.saved': 'Saved ✓', 'toast.savedQueued': 'Saved — it will sync when the internet is back', 'toast.updated': 'Transaction updated ✓',
    'toast.saveErr': 'Could not save', 'toast.lineRemoved': 'Item removed', 'undo': 'Undo',
    'edit.banner': 'Editing the transaction of {date}', 'edit.cancel': 'Cancel',
    'edit.replaceTitle': 'Replace the current invoice?', 'edit.replaceSub': 'The items you have not saved yet will be removed.',
    'cart.items': '{n} items',

    'hist.title': 'History', 'hist.search': 'Search client, item or note…',
    'filter.today': 'Today', 'filter.week': '7 days', 'filter.month': 'This month', 'filter.all': 'All',
    'flag.unpaid': 'Unpaid', 'flag.mistake': 'Mistakes',
    'hist.empty': 'No transactions yet', 'hist.noresults': 'No matching transactions', 'hist.showAll': 'Show all dates',
    'hist.more': 'Show more', 'hist.count': '{n} transactions', 'hist.today': 'Today', 'hist.yesterday': 'Yesterday',
    'hist.mistake': 'Mistake', 'hist.markMistake': 'Mark as mistake', 'hist.unmarkMistake': 'Unmark mistake',
    'hist.edit': 'Edit', 'hist.delete': 'Delete', 'hist.by': 'Recorded by', 'hist.edited': 'edited',
    'hist.pieces': 'pcs', 'hist.items': 'items', 'hist.notes': 'Notes',
    'th.item': 'Item', 'th.qty': 'Qty', 'th.price': 'Price', 'th.total': 'Total',
    'confirm.mistake': 'Mark this transaction as a mistake?', 'confirm.mistakeSub': 'The admin will review it and delete it.',
    'confirm.mark': 'Mark', 'confirm.delTx': 'Delete this transaction?', 'confirm.delTxSub': 'This cannot be undone.',
    'confirm.delete': 'Delete', 'confirm.cancel': 'Cancel',
    'toast.mistakeMarked': 'Marked as mistake ✓', 'toast.mistakeUnmarked': 'Mark removed ✓', 'toast.deleted': 'Deleted',

    'unpaid.title': 'Unpaid', 'unpaid.empty': 'Everything is paid', 'unpaid.total': 'Outstanding',
    'unpaid.markPaid': 'Mark paid', 'unpaid.daysAgo': '{n} days ago', 'unpaid.today': 'today',
    'pay.dialogTitle': 'How was it paid?', 'pay.confirm': 'Confirm payment', 'toast.paid': 'Marked as paid ✓',

    'oc.title': 'Operational costs', 'oc.new': 'Record a cost', 'oc.amount': 'Amount', 'oc.date': 'Date',
    'oc.note': 'Note', 'oc.notePh': 'Optional details…', 'oc.otherType': 'Type', 'oc.otherPh': 'e.g. Rent…',
    'oc.save': 'Save cost', 'oc.saved': 'Cost saved ✓', 'oc.empty': 'No costs in this period', 'oc.total': 'Total costs',
    'oc.delConfirm': 'Delete this cost?',

    'mach.title': 'Machine counters', 'mach.last': 'Last reading', 'mach.never': 'No readings yet',
    'mach.new': 'New reading', 'mach.date': 'Date', 'mach.save': 'Save', 'mach.diff': '+{n} since last reading',
    'toast.readingSaved': 'Reading saved ✓', 'toast.needBoth': 'Enter the reading and the date',
    'mach.empty': 'No machines yet — the admin can add them in Settings',
    'mach.lowerTitle': 'This reading is lower than the last one', 'mach.lowerSub': 'Last reading was {n}. Save anyway?', 'mach.saveAnyway': 'Save',

    'dash.title': 'Dashboard', 'range.today': 'Today', 'range.yesterday': 'Yesterday', 'range.week': 'Last 7 days',
    'range.month': 'This month', 'range.lastmonth': 'Last month', 'range.day': 'Pick a day', 'range.year': 'This year',
    'vs.prevYear': 'vs the same days last year', 'chart.byMonth': 'Revenue by month',
    'chart.mix': 'Revenue by category', 'chart.heat': 'Busy times (number of orders)', 'chart.heat28': 'Busy times · 4 weeks up to this day',
    'chart.clients': 'Top clients', 'heat.fewer': 'fewer', 'heat.more': 'more', 'th.day': 'Day', 'th.orders': 'Orders', 'th.share': 'Share',
    'kpi.vs': 'vs previous period',
    'ins.bestDay': 'Best day', 'ins.peak': 'Busiest hour', 'ins.topSvc': 'Top service', 'ins.topClient': 'Top client',
    'ins.pieces': 'Printed pieces', 'ins.openUnpaid': 'Unpaid orders (all time)', 'ins.share': '{p}% of revenue',
    'dash.revenue': 'Revenue', 'dash.tx': 'Transactions', 'dash.avg': 'Average ticket', 'dash.costs': 'Costs',
    'dash.net': 'Net (revenue − costs)', 'dash.unpaid': 'Not paid yet', 'dash.eng': 'Engineering meters', 'dash.pieces': 'Printed pieces',
    'vs.prevDay': 'vs the day before', 'vs.prev7': 'vs the 7 days before', 'vs.prevMonthSpan': 'vs the same days last month', 'vs.prevMonth': 'vs the month before',
    'dash.noPrev': 'nothing to compare', 'dash.nodata': 'No data for this period',
    'chart.byHour': 'Revenue by hour', 'chart.byDay': 'Revenue by day', 'chart.pay': 'Revenue by payment method',
    'chart.svc': 'Top services by revenue', 'chart.costs': 'Costs by type', 'chart.months': 'Revenue and costs by month',
    'dash.longTerm': 'Last 12 months (all records)', 'chart.table': 'Table', 'chart.chart': 'Chart',
    'legend.revenue': 'Revenue', 'legend.costs': 'Costs', 'th.period': 'Period', 'th.value': 'Value', 'th.jobs': 'Jobs', 'th.net': 'Net',

    'set.title': 'Settings', 'exp.title': 'Export', 'exp.from': 'From', 'exp.to': 'To',
    'exp.btn': 'Excel', 'exp.csvBtn': 'CSV', 'exp.inclMistakes': 'Include transactions marked as mistakes',
    'toast.expNone': 'No data in this period', 'toast.expDone': 'Exported ✓',
    'backup.title': 'Backup', 'backup.desc': 'Download all data as a file for safekeeping, or restore records from a previous backup (existing records are kept).',
    'backup.export': 'Download backup', 'backup.import': 'Restore from file',
    'toast.backupDone': 'Backup downloaded ✓', 'toast.restoreDone': 'Restored {n} records ✓', 'toast.restoreErr': 'Invalid backup file',
    'pw.title': 'Passwords', 'pw.emp': 'New employee password', 'pw.admin': 'New admin password', 'pw.current': 'Current admin password', 'pw.change': 'Change',
    'toast.pwChanged': 'Password changed ✓', 'toast.pwWrong': 'Current admin password is incorrect', 'toast.pwShort': 'Password must be at least 4 characters',
    'machset.title': 'Machines', 'machset.add': 'Add', 'machset.name': 'New machine name',
    'machset.delConfirm': 'Delete this machine?', 'machset.delConfirmSub': 'All its readings will be deleted too.', 'toast.machSaved': 'Machines updated ✓',
    'cat.title': 'Product lists', 'cat.desc': 'Products offered when recording Stationery and Office supplies. New names typed while recording are added automatically.',
    'cat.addPh': 'Add a product…', 'cat.add': 'Add', 'cat.empty': 'No products yet', 'toast.catSaved': 'List updated ✓',
    'about.title': 'About this beta', 'about.desc': 'The beta uses the same database as the classic version: everything recorded here also appears there, and the other way round.',

    'xh.no': '#', 'xh.date': 'Date', 'xh.time': 'Time', 'xh.client': 'Client', 'xh.by': 'Recorded by', 'xh.notes': 'Notes',
    'xh.pay': 'Payment', 'xh.svc': 'Service', 'xh.detail': 'Detail', 'xh.color': 'Color', 'xh.sides': 'Sides',
    'xh.finish': 'Finish', 'xh.engLen': 'Eng. length (m)', 'xh.engNote': 'Eng. note',
    'xh.qty': 'Qty', 'xh.price': 'Unit price', 'xh.final': 'Final price?', 'xh.total': 'Total', 'xh.mistake': 'Mistake?',
    'xh.grand': 'GRAND TOTAL', 'yes': 'Yes', 'no': 'No',
    'xh.machine': 'Machine', 'xh.reading': 'Reading', 'xh.diff': 'Difference', 'xh.type': 'Cost type', 'xh.amount': 'Amount',
    'sheet.tx': 'Transactions', 'sheet.sum': 'Summary', 'sheet.mach': 'Machines', 'sheet.exp': 'Expenses',
    'sum.period': 'Period', 'sum.generated': 'Generated on', 'sum.rev': 'Total revenue',
    'sum.tx': 'Number of transactions', 'sum.pieces': 'Total pieces', 'sum.clients': 'Unique clients',
    'sum.eng': 'Total engineering meters', 'sum.costs': 'Total costs', 'sum.net': 'Net (revenue − costs)',
    'sum.bySvc': 'Breakdown by service', 'sum.svcCol': 'Service', 'sum.qtyCol': 'Pieces', 'sum.revCol': 'Revenue',
    'cur': 'EGP',
  },
  ar: {
    'app.tag': 'تسجيل معاملات مركز الطباعة',
    'login.employee': 'موظف', 'login.employeeSub': 'تسجيل المعاملات',
    'login.admin': 'المدير', 'login.adminSub': 'لوحة المعلومات والتصدير والإعدادات',
    'login.password': 'كلمة المرور', 'login.enter': 'دخول',
    'login.wrong': 'كلمة المرور غير صحيحة', 'login.enterPw': 'أدخل كلمة المرور',
    'mode.local': 'وضع محلي — البيانات على هذا الجهاز فقط.',
    'loading.connecting': 'جاري الاتصال…',
    'err.scripts': 'تعذر تحميل مكتبات Firebase — تأكد من الاتصال بالإنترنت وأعد تحميل الصفحة.',
    'err.auth': 'رفض Firebase الاتصال: تسجيل الدخول المجهول (Anonymous) غير مفعّل.',
    'err.rules': 'رفض Firebase الاتصال: قواعد الأمان تمنع الوصول.',
    'err.notfound': 'قاعدة بيانات Firestore غير منشأة بعد.',
    'err.generic': 'خطأ في الاتصال',
    'beta.classic': 'النسخة الكلاسيكية', 'theme': 'فاتح / داكن', 'logout': 'خروج',
    'status.online': 'متصل', 'status.offline': 'غير متصل — ستتم المزامنة', 'status.local': 'محلي',
    'role.employee': 'موظف', 'role.admin': 'المدير',
    'nav.new': 'جديد', 'nav.history': 'السجل', 'nav.unpaid': 'غير مدفوع', 'nav.expenses': 'المصاريف',
    'nav.machines': 'الماكينات', 'nav.dashboard': 'لوحة المعلومات', 'nav.settings': 'الإعدادات',
    'toast.loginOk': 'تم الدخول ✓',

    'cat.search': 'ابحث عن خدمة…', 'cat.all': 'الكل', 'cat.print': 'طباعة', 'cat.eng': 'هندسي',
    'cat.shop': 'أدوات', 'cat.extra': 'خدمات', 'cat.none': 'لا توجد خدمة مطابقة للبحث',
    'svcsub.A4': 'طباعة · تصوير · سكان', 'svcsub.A3': 'طباعة · تصوير · سكان', 'svcsub.A5': 'طباعة · تصوير · سكان',
    'svcsub.eng': 'لوحات ومطبوعات كبيرة', 'svcsub.books': 'كتب وكشاكيل', 'svcsub.office': 'أقلام، ملفات…',
    'svcsub.pads': 'تكعيب', 'svcsub.wrap': 'تغليف', 'svcsub.upload': 'استمارات أونلاين', 'svcsub.custom': 'أي خدمة أخرى',
    'b.close': 'إغلاق', 'b.addSave': 'إضافة وتسجيل الطلب',
    'page.new': 'طلب جديد', 'pos.services': 'الخدمات', 'side.today': 'اليوم', 'pricing.total': 'سعر إجمالي',
    'svcsub.contract': 'أدوات', 'svcsub.poa': 'أدوات', 'svcsub.writing': 'أدوات',
    'th.title': 'الألوان', 'th.desc': 'اختر درجة الأزرق للوضع الفاتح والداكن على هذا الجهاز.', 'th.light': 'فاتح', 'th.dark': 'داكن',
    'lt.classic': 'كلاسيكي', 'lt.sky': 'سماوي', 'lt.ocean': 'محيطي', 'lt.navy': 'كحلي', 'lt.steel': 'فولاذي', 'lt.indigo': 'نيلي',
    'dt.midnight': 'ليلي', 'dt.navy': 'كحلي', 'dt.ocean': 'محيطي', 'dt.steel': 'فولاذي', 'dt.royal': 'ملكي', 'dt.abyss': 'عميق',
    'side.orders': 'الطلبات', 'side.ordersSub': 'أمس: {n}', 'opb.print': 'طباعة', 'opb.copy': 'تصوير', 'opb.scan': 'سكان',
    'nav.toggle': 'إظهار / إخفاء القائمة', 'nav.menu': 'القائمة', 'nav.admin': 'الإدارة', 'nav.collapse': 'تصغير', 'dash.engJobs': 'أعمال الهندسي', 'newtx.clientPh': 'اسم العميل (اختياري)', 'sum.items': 'البنود', 'order.no': 'طلب رقم {n} اليوم',
    'b.title': 'إضافة خدمة', 'b.edit': 'تعديل الخدمة', 'b.reset': 'مسح',
    'b.item': 'المنتج', 'desc.optional': 'الوصف (اختياري)', 'custom.name': 'اسم الخدمة',
    'b.isTotal': 'السعر هو الإجمالي لكل القطع', 'b.lineTotal': 'إجمالي البند',
    'b.lastPrice': 'آخر سعر مستخدم', 'b.update': 'تحديث', 'add': 'إضافة', 'b.editLine': 'تعديل هذا البند',
    'b.err.price': 'أدخل السعر', 'b.err.length': 'أدخل الطول', 'b.err.desc': 'أدخل الاسم', 'b.err.qty': 'الكمية 1 على الأقل',
    'svc.section': 'الخدمة', 'op.section': 'العملية', 'color.section': 'اللون', 'face.section': 'الوجوه', 'finish.section': 'الإنهاء',
    'eng.pricing': 'التسعير', 'eng.perMeter': 'بالمتر', 'eng.fixed': 'سعر ثابت',
    'eng.length': 'الطول (متر)', 'eng.note': 'ملاحظة', 'eng.notePh': 'مثلاً: مخطط أرضي…', 'eng.m': 'متر',
    'qty': 'الكمية', 'price.unit': 'سعر القطعة', 'price.total': 'السعر الإجمالي', 'price.job': 'السعر', 'price.meter': 'سعر المتر',
    'inv.title': 'الطلب الحالي', 'inv.clear': 'مسح', 'inv.empty': 'لا توجد بنود بعد', 'inv.emptySub': 'اختر خدمة للبدء', 'inv.total': 'الإجمالي', 'inv.final': 'سعر إجمالي',
    'newtx.client': 'العميل', 'newtx.optional': 'اختياري', 'newtx.addNote': 'ملاحظة', 'newtx.notesPh': 'أي تفاصيل إضافية…', 'newtx.defaultClient': 'عميل',
    'pay.section': 'الدفع', 'pay.otherPh': 'مثلاً: تحويل بنكي…',
    'save.tx': 'تسجيل الطلب', 'save.update': 'تحديث المعاملة', 'save.short': 'حفظ',
    'toast.saved': 'تم الحفظ ✓', 'toast.savedQueued': 'تم الحفظ — ستتم المزامنة عند عودة الإنترنت', 'toast.updated': 'تم تحديث المعاملة ✓',
    'toast.saveErr': 'تعذر الحفظ', 'toast.lineRemoved': 'تم حذف البند', 'undo': 'تراجع',
    'edit.banner': 'تعديل معاملة يوم {date}', 'edit.cancel': 'إلغاء',
    'edit.replaceTitle': 'استبدال الفاتورة الحالية؟', 'edit.replaceSub': 'البنود التي لم تُحفظ بعد ستُحذف.',
    'cart.items': '{n} بنود',

    'hist.title': 'السجل', 'hist.search': 'ابحث بالعميل أو الخدمة أو الملاحظة…',
    'filter.today': 'اليوم', 'filter.week': '7 أيام', 'filter.month': 'هذا الشهر', 'filter.all': 'الكل',
    'flag.unpaid': 'غير مدفوع', 'flag.mistake': 'أخطاء',
    'hist.empty': 'لا توجد معاملات بعد', 'hist.noresults': 'لا توجد معاملات مطابقة', 'hist.showAll': 'عرض كل التواريخ',
    'hist.more': 'عرض المزيد', 'hist.count': '{n} معاملة', 'hist.today': 'اليوم', 'hist.yesterday': 'أمس',
    'hist.mistake': 'خطأ', 'hist.markMistake': 'تحديد كخطأ', 'hist.unmarkMistake': 'إلغاء تحديد الخطأ',
    'hist.edit': 'تعديل', 'hist.delete': 'حذف', 'hist.by': 'سجّلها', 'hist.edited': 'معدّلة',
    'hist.pieces': 'قطعة', 'hist.items': 'بنود', 'hist.notes': 'ملاحظات',
    'th.item': 'البند', 'th.qty': 'الكمية', 'th.price': 'السعر', 'th.total': 'الإجمالي',
    'confirm.mistake': 'تحديد هذه المعاملة كخطأ؟', 'confirm.mistakeSub': 'سيراجعها المدير ثم يحذفها.',
    'confirm.mark': 'تحديد', 'confirm.delTx': 'حذف هذه المعاملة؟', 'confirm.delTxSub': 'لا يمكن التراجع عن الحذف.',
    'confirm.delete': 'حذف', 'confirm.cancel': 'إلغاء',
    'toast.mistakeMarked': 'تم التحديد كخطأ ✓', 'toast.mistakeUnmarked': 'تم إلغاء التحديد ✓', 'toast.deleted': 'تم الحذف',

    'unpaid.title': 'غير مدفوع', 'unpaid.empty': 'كل المعاملات مدفوعة', 'unpaid.total': 'إجمالي المستحقات',
    'unpaid.markPaid': 'تم الدفع', 'unpaid.daysAgo': 'منذ {n} يوم', 'unpaid.today': 'اليوم',
    'pay.dialogTitle': 'كيف تم الدفع؟', 'pay.confirm': 'تأكيد الدفع', 'toast.paid': 'تم تسجيل الدفع ✓',

    'oc.title': 'المصاريف التشغيلية', 'oc.new': 'تسجيل مصروف', 'oc.amount': 'المبلغ', 'oc.date': 'التاريخ',
    'oc.note': 'ملاحظة', 'oc.notePh': 'تفاصيل اختيارية…', 'oc.otherType': 'النوع', 'oc.otherPh': 'مثلاً: إيجار…',
    'oc.save': 'حفظ المصروف', 'oc.saved': 'تم حفظ المصروف ✓', 'oc.empty': 'لا توجد مصاريف في هذه الفترة', 'oc.total': 'إجمالي المصاريف',
    'oc.delConfirm': 'حذف هذا المصروف؟',

    'mach.title': 'عدادات الماكينات', 'mach.last': 'آخر قراءة', 'mach.never': 'لا توجد قراءات بعد',
    'mach.new': 'القراءة الجديدة', 'mach.date': 'التاريخ', 'mach.save': 'حفظ', 'mach.diff': '+{n} منذ آخر قراءة',
    'toast.readingSaved': 'تم حفظ القراءة ✓', 'toast.needBoth': 'أدخل القراءة والتاريخ',
    'mach.empty': 'لا توجد ماكينات — يمكن للمدير إضافتها من الإعدادات',
    'mach.lowerTitle': 'هذه القراءة أقل من القراءة السابقة', 'mach.lowerSub': 'آخر قراءة كانت {n}. هل تريد الحفظ؟', 'mach.saveAnyway': 'حفظ',

    'dash.title': 'لوحة المعلومات', 'range.today': 'اليوم', 'range.yesterday': 'أمس', 'range.week': 'آخر 7 أيام',
    'range.month': 'هذا الشهر', 'range.lastmonth': 'الشهر الماضي', 'range.day': 'اختر يوماً', 'range.year': 'هذا العام',
    'vs.prevYear': 'مقارنة بنفس الأيام من العام الماضي', 'chart.byMonth': 'الإيرادات حسب الشهر',
    'chart.mix': 'الإيرادات حسب الفئة', 'chart.heat': 'أوقات الذروة (عدد الطلبات)', 'chart.heat28': 'أوقات الذروة · 4 أسابيع حتى هذا اليوم',
    'chart.clients': 'أهم العملاء', 'heat.fewer': 'أقل', 'heat.more': 'أكثر', 'th.day': 'اليوم', 'th.orders': 'الطلبات', 'th.share': 'النسبة',
    'kpi.vs': 'مقارنة بالفترة السابقة',
    'ins.bestDay': 'أفضل يوم', 'ins.peak': 'ساعة الذروة', 'ins.topSvc': 'أعلى خدمة', 'ins.topClient': 'أهم عميل',
    'ins.pieces': 'القطع المطبوعة', 'ins.openUnpaid': 'طلبات غير مدفوعة (الكل)', 'ins.share': '{p}% من الإيرادات',
    'dash.revenue': 'الإيرادات', 'dash.tx': 'المعاملات', 'dash.avg': 'متوسط المعاملة', 'dash.costs': 'المصاريف',
    'dash.net': 'الصافي (الإيرادات − المصاريف)', 'dash.unpaid': 'لم يُدفع بعد', 'dash.eng': 'أمتار الهندسي', 'dash.pieces': 'القطع المطبوعة',
    'vs.prevDay': 'مقارنة باليوم السابق', 'vs.prev7': 'مقارنة بالـ 7 أيام السابقة', 'vs.prevMonthSpan': 'مقارنة بنفس الأيام من الشهر الماضي', 'vs.prevMonth': 'مقارنة بالشهر السابق',
    'dash.noPrev': 'لا توجد بيانات للمقارنة', 'dash.nodata': 'لا توجد بيانات لهذه الفترة',
    'chart.byHour': 'الإيرادات حسب الساعة', 'chart.byDay': 'الإيرادات حسب اليوم', 'chart.pay': 'الإيرادات حسب طريقة الدفع',
    'chart.svc': 'أعلى الخدمات إيراداً', 'chart.costs': 'المصاريف حسب النوع', 'chart.months': 'الإيرادات والمصاريف حسب الشهر',
    'dash.longTerm': 'آخر 12 شهر (كل السجلات)', 'chart.table': 'جدول', 'chart.chart': 'رسم',
    'legend.revenue': 'الإيرادات', 'legend.costs': 'المصاريف', 'th.period': 'الفترة', 'th.value': 'القيمة', 'th.jobs': 'المرات', 'th.net': 'الصافي',

    'set.title': 'الإعدادات', 'exp.title': 'التصدير', 'exp.from': 'من', 'exp.to': 'إلى',
    'exp.btn': 'Excel', 'exp.csvBtn': 'CSV', 'exp.inclMistakes': 'تضمين المعاملات المحددة كخطأ',
    'toast.expNone': 'لا توجد بيانات في هذه الفترة', 'toast.expDone': 'تم التصدير ✓',
    'backup.title': 'النسخ الاحتياطي', 'backup.desc': 'نزّل كل البيانات في ملف للحفاظ عليها، أو استعد السجلات من نسخة سابقة (السجلات الحالية تبقى كما هي).',
    'backup.export': 'تنزيل نسخة احتياطية', 'backup.import': 'استعادة من ملف',
    'toast.backupDone': 'تم تنزيل النسخة الاحتياطية ✓', 'toast.restoreDone': 'تمت استعادة {n} سجل ✓', 'toast.restoreErr': 'ملف النسخة الاحتياطية غير صالح',
    'pw.title': 'كلمات المرور', 'pw.emp': 'كلمة مرور الموظفين الجديدة', 'pw.admin': 'كلمة مرور المدير الجديدة', 'pw.current': 'كلمة مرور المدير الحالية', 'pw.change': 'تغيير',
    'toast.pwChanged': 'تم تغيير كلمة المرور ✓', 'toast.pwWrong': 'كلمة مرور المدير الحالية غير صحيحة', 'toast.pwShort': 'كلمة المرور 4 أحرف على الأقل',
    'machset.title': 'الماكينات', 'machset.add': 'إضافة', 'machset.name': 'اسم ماكينة جديدة',
    'machset.delConfirm': 'حذف هذه الماكينة؟', 'machset.delConfirmSub': 'سيتم حذف كل قراءاتها أيضاً.', 'toast.machSaved': 'تم تحديث الماكينات ✓',
    'cat.title': 'قوائم المنتجات', 'cat.desc': 'المنتجات المعروضة عند تسجيل الكتابية والأدوات المكتبية. الأسماء الجديدة التي تُكتب أثناء التسجيل تُضاف تلقائياً.',
    'cat.addPh': 'أضف منتجاً…', 'cat.add': 'إضافة', 'cat.empty': 'لا توجد منتجات بعد', 'toast.catSaved': 'تم تحديث القائمة ✓',
    'about.title': 'عن النسخة التجريبية', 'about.desc': 'النسخة التجريبية تستخدم نفس قاعدة بيانات النسخة الكلاسيكية: كل ما يُسجل هنا يظهر هناك، والعكس.',

    'xh.no': 'رقم', 'xh.date': 'التاريخ', 'xh.time': 'الوقت', 'xh.client': 'العميل', 'xh.by': 'سجّلها', 'xh.notes': 'الملاحظات',
    'xh.pay': 'الدفع', 'xh.svc': 'الخدمة', 'xh.detail': 'التفصيل', 'xh.color': 'اللون', 'xh.sides': 'الأوجه',
    'xh.finish': 'الإنهاء', 'xh.engLen': 'طول هندسي (متر)', 'xh.engNote': 'ملاحظة هندسية',
    'xh.qty': 'الكمية', 'xh.price': 'سعر الوحدة', 'xh.final': 'سعر نهائي؟', 'xh.total': 'الإجمالي', 'xh.mistake': 'خطأ؟',
    'xh.grand': 'الإجمالي الكلي', 'yes': 'نعم', 'no': 'لا',
    'xh.machine': 'الماكينة', 'xh.reading': 'القراءة', 'xh.diff': 'الفرق', 'xh.type': 'نوع المصروف', 'xh.amount': 'المبلغ',
    'sheet.tx': 'المعاملات', 'sheet.sum': 'الملخص', 'sheet.mach': 'الماكينات', 'sheet.exp': 'المصاريف',
    'sum.period': 'الفترة', 'sum.generated': 'تاريخ الإنشاء', 'sum.rev': 'إجمالي الإيرادات',
    'sum.tx': 'عدد المعاملات', 'sum.pieces': 'إجمالي القطع', 'sum.clients': 'عدد العملاء',
    'sum.eng': 'إجمالي أطوال الهندسي', 'sum.costs': 'إجمالي المصاريف', 'sum.net': 'الصافي (الإيرادات − المصاريف)',
    'sum.bySvc': 'تفصيل حسب الخدمة', 'sum.svcCol': 'الخدمة', 'sum.qtyCol': 'القطع', 'sum.revCol': 'الإيرادات',
    'cur': 'ج.م',
  }
};

const SVC_LABELS = {
  A4: { en: 'A4', ar: 'A4' }, A3: { en: 'A3', ar: 'A3' }, A5: { en: 'A5', ar: 'A5' },
  eng: { en: 'Engineering', ar: 'هندسي' },
  books: { en: 'Stationery', ar: 'كتابية' },
  office: { en: 'Office Supplies', ar: 'أدوات مكتبية' },
  pads: { en: 'Pads', ar: 'تكعيب' },
  wrap: { en: 'Lamination', ar: 'تغليف' },
  upload: { en: 'Electronic Upload', ar: 'رفع الكتروني' },
  custom: { en: 'Other service', ar: 'خدمة أخرى' },
  contract: { en: 'Contract', ar: 'عقد' },
  poa: { en: 'Power of Attorney', ar: 'توكيل' },
  writing: { en: 'Writing', ar: 'كتابة' },
};
const VAL_LABELS = {
  print: { en: 'Print', ar: 'طباعة' }, scan: { en: 'Scan', ar: 'سكان' }, copy: { en: 'Photocopy', ar: 'تصوير' },
  black: { en: 'Black', ar: 'اسود' }, color: { en: 'Color', ar: 'الوان' },
  one: { en: 'One side', ar: 'وجه واحد' }, two: { en: 'Two sides', ar: 'وجهين' },
  normal: { en: 'Normal', ar: 'عادي' }, glossy: { en: 'Glossy', ar: 'جلوسي' },
};
const EXP_LABELS = {
  repair: { en: 'Repair service', ar: 'صيانة' }, internet: { en: 'Internet', ar: 'إنترنت' },
  electricity: { en: 'Electricity', ar: 'كهرباء' }, salaries: { en: 'Salaries', ar: 'مرتبات' },
  inventory: { en: 'Inventory / Products', ar: 'بضاعة ومشتريات' }, other: { en: 'Other', ar: 'أخرى' },
};
const EXP_ICONS = { repair: 'wrench', internet: 'wifi', electricity: 'zap', salaries: 'users', inventory: 'package', other: 'pencil' };
const PAY_LABELS = {
  cash: { en: 'Cash', ar: 'كاش' }, instapay: { en: 'InstaPay', ar: 'انستاباي' },
  vodafone: { en: 'Vodafone Cash', ar: 'فودافون كاش' }, notpaid: { en: 'Not Paid', ar: 'غير مدفوع' },
  other: { en: 'Other', ar: 'أخرى' },
};
/* Service tiles: category, icon and the tile's two gradient colours */
const SVC_DEFS = [
  { k: 'A4', cat: 'print', icon: 'file', c: ['#3b82f6', '#1e40af'] },
  { k: 'A3', cat: 'print', icon: 'file-text', c: ['#8b5cf6', '#5b21b6'] },
  { k: 'A5', cat: 'print', icon: 'sticky-note', c: ['#06b6d4', '#0e7490'] },
  { k: 'eng', cat: 'eng', icon: 'drafting-compass', c: ['#f97316', '#b45309'] },
  // stationery: three plain items, price (and quantity) only
  { k: 'contract', cat: 'shop', icon: 'file-signature', c: ['#10b981', '#047857'], plain: true },
  { k: 'poa', cat: 'shop', icon: 'stamp', c: ['#ec4899', '#9d174d'], plain: true },
  { k: 'writing', cat: 'shop', icon: 'pen-line', c: ['#eab308', '#a16207'], plain: true },
  // older stationery items: no tile any more, kept so saved orders still show their name and icon
  { k: 'books', cat: 'shop', icon: 'book-open', c: ['#10b981', '#047857'], hidden: true },
  { k: 'office', cat: 'shop', icon: 'paperclip', c: ['#ec4899', '#9d174d'], hidden: true },
  { k: 'pads', cat: 'shop', icon: 'notebook-pen', c: ['#eab308', '#a16207'], hidden: true },
  { k: 'wrap', cat: 'extra', icon: 'layers', c: ['#6366f1', '#3730a3'] },
  { k: 'upload', cat: 'extra', icon: 'cloud-upload', c: ['#0ea5e9', '#075985'] },
  { k: 'custom', cat: 'extra', icon: 'wand-sparkles', c: ['#64748b', '#334155'] },
];
const SVC_DEF = Object.fromEntries(SVC_DEFS.map(d => [d.k, d]));
const SVC_ICONS = Object.fromEntries(SVC_DEFS.map(d => [d.k, d.icon]));

let lang = localStorage.getItem('pz_lang') || 'ar';
function t(key, vars) {
  let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  if (vars) Object.keys(vars).forEach(k => { s = s.replace('{' + k + '}', vars[k]); });
  return s;
}
const locale = () => (lang === 'ar' ? 'ar-EG' : 'en-GB');
function svcLabel(k) { return SVC_LABELS[k] ? SVC_LABELS[k][lang] : k; }
function valLabel(k) { if (!k || k === '—') return '—'; return VAL_LABELS[k] ? VAL_LABELS[k][lang] : k; }
function expLabel(e) { if (e.type === 'other') return e.otherLabel || EXP_LABELS.other[lang]; return EXP_LABELS[e.type] ? EXP_LABELS[e.type][lang] : e.type; }
function payLabel(tx) { if (!tx.payMethod) return PAY_LABELS.cash[lang]; if (tx.payMethod === 'other') return tx.payOther || PAY_LABELS.other[lang]; return PAY_LABELS[tx.payMethod] ? PAY_LABELS[tx.payMethod][lang] : tx.payMethod; }
function fmtNum(n) { return round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtInt(n) { return Math.round(n || 0).toLocaleString('en-US'); }
function fmtMoney(n) { return fmtNum(n) + ' ' + t('cur'); }
function fmtCompact(n) { const a = Math.abs(n); if (a >= 1e6) return round1(n / 1e6) + 'M'; if (a >= 1e3) return round1(n / 1e3) + 'K'; return fmtInt(n); }
function round1(n) { return (Math.round(n * 10) / 10).toString(); }
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); } catch (e) { return ''; } }
function fmtDate(d, opts) { try { return new Date(d + 'T00:00:00').toLocaleDateString(locale(), opts || { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return d; } }
function fmtDay(d) {
  if (d === todayStr()) return t('hist.today');
  if (d === addDays(todayStr(), -1)) return t('hist.yesterday');
  return fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

/* ==================== STATE ==================== */
const state = {
  role: null, online: false, initError: null,
  transactions: [], expenses: [], machines: [], settings: null, catalog: { books: [], office: [] },
  page: 'pageNew',
  deviceId: localStorage.getItem('pz_device') || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
};
localStorage.setItem('pz_device', state.deviceId);

/* Values derived from the transaction list, recomputed only when the list changes */
function memoTx(fn) { let ref = null, refLang = null, val; return () => { if (ref !== state.transactions || refLang !== lang) { ref = state.transactions; refLang = lang; val = fn(); } return val; }; }
const sortedTx = memoTx(() => state.transactions.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
const liveTx = memoTx(() => sortedTx().filter(tx => !tx.mistake));

/* Same key for the same service + options, used for remembered prices and quick picks */
function itemKey(it) {
  if (it.type === 'paper') return ['p', it.svc, it.op, it.color, it.face, it.finish, it.svc === 'eng' ? (it.engPerMeter ? 'm' : 'f') : ''].join('|');
  if (it.type === 'simple') return ['s', it.svc, (it.desc || '').trim()].join('|');
  if (it.type === 'custom') return ['c', (it.desc || '').trim()].join('|');
  return '';
}
function itemTitle(it) {
  if (it.type === 'custom') return it.desc || svcLabel('custom');
  if (it.type === 'simple') return svcLabel(it.svc) + (it.desc ? ' · ' + it.desc : '');
  const parts = [svcLabel(it.svc), valLabel(it.op)];
  if (it.op !== 'scan' && it.color && it.color !== '—') {
    parts.push(valLabel(it.color));
    if (it.face === 'two') parts.push(valLabel('two'));
    if (it.finish === 'glossy') parts.push(valLabel('glossy'));
  }
  return parts.join(' · ');
}
function txSummary(tx) {
  return (tx.items || []).map(it => {
    let s = itemTitle(it);
    if (it.engLength > 0) s += ' ' + it.engLength + t('eng.m');
    else if (!it.noQty && it.qty > 1) s += ' ×' + it.qty;
    return s;
  }).join(' · ');
}

/* ==================== STORAGE ==================== */
let db = null;
function getFbConfig() {
  if (FIREBASE_CONFIG && FIREBASE_CONFIG.projectId) return FIREBASE_CONFIG;
  try { const c = JSON.parse(localStorage.getItem('pz_fbconfig') || 'null'); if (c && c.projectId) return c; } catch (e) {}
  return null;
}
const DEFAULT_MACHINES = [
  { id: 'xerox_b1', name: 'زيروكس اسود', order: 1, records: [] },
  { id: 'xerox_b2', name: 'زيروكس اسود 2', order: 2, records: [] },
  { id: 'xerox_c', name: 'زيروكس الوان', order: 3, records: [] },
  { id: 'oc_eng', name: 'OC هندسى', order: 4, records: [] },
  { id: 'hp', name: 'HP', order: 5, records: [] },
];

/* Local mode: the same localStorage keys as the classic app */
const LocalStore = {
  async init() {
    state.transactions = JSON.parse(localStorage.getItem('pz_tx') || '[]');
    state.expenses = JSON.parse(localStorage.getItem('pz_exp') || '[]');
    state.catalog = JSON.parse(localStorage.getItem('pz_catalog') || 'null') || { books: [], office: [] };
    let mc = JSON.parse(localStorage.getItem('pz_mc') || 'null');
    if (!mc) { mc = DEFAULT_MACHINES; localStorage.setItem('pz_mc', JSON.stringify(mc)); }
    state.machines = mc;
    let s = JSON.parse(localStorage.getItem('pz_settings') || 'null');
    if (!s) { s = { empHash: await hashPw(DEFAULT_EMP_PW), adminHash: await hashPw(DEFAULT_ADMIN_PW) }; localStorage.setItem('pz_settings', JSON.stringify(s)); }
    state.settings = s;
  },
  _saveTx() { localStorage.setItem('pz_tx', JSON.stringify(state.transactions)); refreshAfterData(); },
  _saveExp() { localStorage.setItem('pz_exp', JSON.stringify(state.expenses)); refreshAfterData(); },
  async addTx(tx) { tx.id = 'L' + Date.now() + Math.random().toString(36).slice(2, 6); state.transactions = [tx, ...state.transactions]; this._saveTx(); },
  async delTx(id) { state.transactions = state.transactions.filter(x => x.id !== id); this._saveTx(); },
  async updateTx(id, patch) { state.transactions = state.transactions.map(x => x.id === id ? { ...x, ...patch } : x); this._saveTx(); },
  async addExp(exp) { exp.id = 'E' + Date.now() + Math.random().toString(36).slice(2, 6); state.expenses = [exp, ...state.expenses]; this._saveExp(); },
  async delExp(id) { state.expenses = state.expenses.filter(e => e.id !== id); this._saveExp(); },
  async saveCatalog(cat) { state.catalog = cat; localStorage.setItem('pz_catalog', JSON.stringify(cat)); },
  async saveMachines(machines) { state.machines = machines; localStorage.setItem('pz_mc', JSON.stringify(machines)); refreshAfterData(); },
  async saveSettings(s) { state.settings = s; localStorage.setItem('pz_settings', JSON.stringify(s)); },
  async importRecords(txs, exps) {
    if (txs.length) { state.transactions = [...txs, ...state.transactions]; localStorage.setItem('pz_tx', JSON.stringify(state.transactions)); }
    if (exps.length) { state.expenses = [...exps, ...state.expenses]; localStorage.setItem('pz_exp', JSON.stringify(state.expenses)); }
    refreshAfterData();
  },
};

/* Online mode: the same Firestore collections and documents as the classic app */
const FireStore = {
  async init() {
    firebase.initializeApp(getFbConfig());
    db = firebase.firestore();
    try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* multi-tab or unsupported — fine */ }
    await firebase.auth().signInAnonymously();
    state.online = true;

    const sRef = db.collection('settings').doc('config');
    const sSnap = await sRef.get();
    if (!sSnap.exists) {
      const seed = { empHash: await hashPw(DEFAULT_EMP_PW), adminHash: await hashPw(DEFAULT_ADMIN_PW) };
      await sRef.set(seed);
      state.settings = seed;
    } else state.settings = sSnap.data();
    sRef.onSnapshot(snap => { if (snap.exists) state.settings = snap.data(); });

    const mSnap = await db.collection('machines').get();
    if (mSnap.empty) {
      const batch = db.batch();
      DEFAULT_MACHINES.forEach(m => batch.set(db.collection('machines').doc(m.id), m));
      await batch.commit();
    }
    db.collection('machines').onSnapshot(snap => {
      state.machines = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (a.order || 0) - (b.order || 0));
      refreshAfterData();
    });
    db.collection('transactions').orderBy('createdAt', 'desc').limit(5000).onSnapshot(snap => {
      state.transactions = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      refreshAfterData();
    });
    db.collection('expenses').orderBy('createdAt', 'desc').limit(5000).onSnapshot(snap => {
      state.expenses = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      refreshAfterData();
    });
    const cRef = db.collection('settings').doc('catalog');
    const cSnap = await cRef.get();
    state.catalog = cSnap.exists ? cSnap.data() : { books: [], office: [] };
    cRef.onSnapshot(snap => { if (snap.exists) { state.catalog = snap.data(); refreshAfterData(); } });
  },
  addTx(tx) { return db.collection('transactions').add(tx); },
  delTx(id) { return db.collection('transactions').doc(id).delete(); },
  updateTx(id, patch) { return db.collection('transactions').doc(id).update(patch); },
  addExp(exp) { return db.collection('expenses').add(exp); },
  delExp(id) { return db.collection('expenses').doc(id).delete(); },
  async saveCatalog(cat) { state.catalog = cat; await db.collection('settings').doc('catalog').set(cat); },
  async saveMachines(machines) {
    const batch = db.batch();
    const existing = new Set(state.machines.map(m => m.id));
    machines.forEach(m => {
      const id = m.id || ('m' + Date.now() + Math.random().toString(36).slice(2, 5));
      batch.set(db.collection('machines').doc(id), { name: m.name, order: m.order, records: m.records || [] });
      existing.delete(id);
    });
    existing.forEach(id => batch.delete(db.collection('machines').doc(id)));
    await batch.commit();
  },
  async saveSettings(s) { await db.collection('settings').doc('config').set(s); },
  async importRecords(txs, exps) {
    const put = async (coll, list) => {
      for (let i = 0; i < list.length; i += 450) {
        const batch = db.batch();
        list.slice(i, i + 450).forEach(r => batch.set(db.collection(coll).doc(String(r.id)), r));
        await batch.commit();
      }
    };
    await put('transactions', txs);
    await put('expenses', exps);
  },
};
let store = LocalStore;

/* Firestore keeps writes made offline and syncs them later, but its promise only
   settles once the server answers — so wait briefly, then treat the write as queued. */
function commit(promise) {
  if (!state.online) return Promise.resolve(promise).then(() => 'done');
  return new Promise((resolve, reject) => {
    let late = false;
    const tm = setTimeout(() => { late = true; resolve(navigator.onLine ? 'done' : 'queued'); }, 1500);
    promise.then(() => { clearTimeout(tm); if (!late) resolve('done'); }, err => {
      clearTimeout(tm);
      if (!late) { reject(err); return; }
      console.error(err);
      toast(t('toast.saveErr') + ': ' + ((err && err.message) || ''), { error: true, ms: 6000 });
    });
  });
}

/* ==================== RENDER SCHEDULING ==================== */
const pageRenderers = {};
let renderQueued = false;
function refreshAfterData() {
  if (!state.role || renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderActivePage(); renderBadges(); });
}
function renderActivePage() { const fn = pageRenderers[state.page]; if (fn) fn(); }
function renderBadges() {
  const live = liveTx();
  const n = live.filter(tx => tx.payMethod === 'notpaid').length;
  ['unpaidBadge', 'bellDot'].forEach(id => { const b = $(id); b.hidden = !n; b.textContent = n > 99 ? '99+' : n; });
  renderSideStats(live);
}
/* Sidebar "today" figure: orders against yesterday */
function renderSideStats(live) {
  const today = todayStr(), yest = addDays(today, -1);
  let nToday = 0, nYest = 0;
  for (const tx of live) {
    if (tx.date === today) nToday++;
    else if (tx.date === yest) nYest++;
  }
  $('ssOrders').textContent = fmtInt(nToday);
  $('ssOrdersBar').style.width = (nToday ? nToday / Math.max(nToday, nYest) * 100 : 0) + '%';
  $('ssOrdersSub').textContent = t('side.ordersSub', { n: fmtInt(nYest) });
}

/* ==================== UI: TOAST, DIALOGS, TOOLTIP ==================== */
function toast(msg, opts = {}) {
  const el = $('toast');
  $('toastMsg').textContent = msg;
  const act = $('toastAction');
  act.hidden = !opts.action;
  if (opts.action) { act.textContent = opts.action.label; act.onclick = () => { el.classList.remove('show'); opts.action.fn(); }; }
  el.classList.toggle('error', !!opts.error);
  el.classList.add('show');
  clearTimeout(el._tm);
  el._tm = setTimeout(() => el.classList.remove('show'), opts.ms || (opts.action ? 5000 : 2400));
}

function openOverlay(id, focusId) {
  const o = $(id);
  o.hidden = false;
  requestAnimationFrame(() => o.classList.add('visible'));
  if (focusId) setTimeout(() => $(focusId).focus(), 30);
}
function closeOverlay(id) { const o = $(id); o.classList.remove('visible'); o.hidden = true; }

/* Resolves true/false. danger=false shows a green confirm button. */
function askConfirm({ title, sub = '', yes, danger = true, icon = 'trash-2' }) {
  return new Promise(resolve => {
    $('confirmTitle').textContent = title;
    $('confirmSub').textContent = sub;
    $('confirmIcon').innerHTML = ic(icon);
    $('confirmIcon').className = 'modal-icon' + (danger ? '' : ' warn');
    $('confirmYes').textContent = yes || t('confirm.delete');
    $('confirmYes').className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    $('confirmNo').textContent = t('confirm.cancel');
    const done = v => { closeOverlay('confirmOverlay'); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    document.addEventListener('keydown', onKey, true);
    $('confirmYes').onclick = () => done(true);
    $('confirmNo').onclick = () => done(false);
    $('confirmOverlay').onclick = e => { if (e.target === $('confirmOverlay')) done(false); };
    openOverlay('confirmOverlay', 'confirmYes');
  });
}

/* Asks which method a debt was paid with. Resolves {payMethod, payOther} or null. */
function askPayMethod(sub) {
  return new Promise(resolve => {
    let sel = 'cash';
    const chips = qsa('#payDlgChips .pchip');
    const sync = () => { chips.forEach(c => c.classList.toggle('sel', c.dataset.pay === sel)); $('payDlgOther').hidden = sel !== 'other'; };
    $('paySub').textContent = sub || '';
    $('payDlgOther').value = '';
    chips.forEach(c => { c.onclick = () => { sel = c.dataset.pay; sync(); if (sel === 'other') $('payDlgOther').focus(); }; });
    sync();
    const done = v => { closeOverlay('payOverlay'); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', onKey, true);
    $('payYes').onclick = () => done({ payMethod: sel, payOther: sel === 'other' ? ($('payDlgOther').value.trim() || null) : null });
    $('payNo').onclick = () => done(null);
    $('payOverlay').onclick = e => { if (e.target === $('payOverlay')) done(null); };
    openOverlay('payOverlay', 'payYes');
  });
}

/* One tooltip for every chart mark: value first, label second (textContent only) */
(function setupTooltip() {
  const tip = $('tip');
  const show = (el, x, y) => {
    tip.replaceChildren();
    const v = document.createElement('strong'); v.textContent = el.dataset.tipV || '';
    const l = document.createElement('span'); l.textContent = el.dataset.tipL || '';
    tip.append(v, l);
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8);
    const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  };
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('[data-tip-v]');
    if (el) show(el, e.clientX, e.clientY); else tip.hidden = true;
  });
  document.addEventListener('focusin', e => {
    const el = e.target.closest && e.target.closest('[data-tip-v]');
    if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } else tip.hidden = true;
  });
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);
})();

/* ==================== NAVIGATION ==================== */
function go(pageId) {
  if ((pageId === 'pageDashboard' || pageId === 'pageSettings') && state.role !== 'admin') return;
  state.page = pageId;
  qsa('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  document.body.dataset.page = pageId;
  updatePageTitle();
  setNavOpen(false);
  setUserMenu(false);
  qsa('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
  // wide screens scroll inside the app card, phones scroll the window
  window.scrollTo(0, 0);
  $('main').scrollTop = 0;
  renderActivePage();
}
$('nav').addEventListener('click', e => { const b = e.target.closest('.nav-item[data-page]'); if (b) go(b.dataset.page); });
const PAGES = {
  pageNew: ['page.new', 'layout-grid'], pageHistory: ['hist.title', 'clock-3'], pageUnpaid: ['unpaid.title', 'hourglass'],
  pageExpenses: ['oc.title', 'wallet'], pageMachines: ['mach.title', 'printer'], pageDashboard: ['dash.title', 'bar-chart-3'], pageSettings: ['set.title', 'settings'],
};
/* The page title carries the page's icon in a small blue square */
function updatePageTitle() {
  const [title, icon] = PAGES[state.page] || PAGES.pageNew;
  $('pageTitle').textContent = t(title);
  $('pageIcon').innerHTML = ic(icon);
}
/* The logo is the way back to recording orders */
$('brandHome').addEventListener('click', e => { e.preventDefault(); if (state.role) go('pageNew'); });
$('bellBtn').addEventListener('click', () => go('pageUnpaid'));

/* Account menu under the avatar: status, version, classic link, sign out */
function setUserMenu(open) { $('userMenu').hidden = !open; $('userBtn').setAttribute('aria-expanded', open); }
$('userBtn').addEventListener('click', () => setUserMenu($('userMenu').hidden));
document.addEventListener('click', e => { if (!e.target.closest('.user')) setUserMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setUserMenu(false); });
function setRoleUi() {
  const name = t('role.' + state.role);
  $('rolePill').textContent = $('umRole').textContent = name;
  // Arabic role names start with the article "ال", so the avatar uses the letter after it
  $('avatarTxt').textContent = $('umInitial').textContent = name.replace(/^ال/, '').charAt(0).toUpperCase();
}

/* Sidebar: collapsed to icons on wide screens (remembered), a drawer on narrow ones */
const narrowNav = () => matchMedia('(max-width:899px)').matches;
function setNavOpen(open) {
  document.body.classList.toggle('nav-open', open);
  $('navBackdrop').hidden = !open;
}
function setNavCollapsed(c) {
  document.body.classList.toggle('nav-collapsed', c);
  try { localStorage.setItem('pz_beta_nav', c ? 'collapsed' : 'open'); } catch (e) { /* private mode */ }
}
try { if (localStorage.getItem('pz_beta_nav') === 'collapsed') document.body.classList.add('nav-collapsed'); } catch (e) { /* private mode */ }
/* the header button opens the drawer on phones; the button at the top of the sidebar collapses it (or closes the drawer) */
$('navToggle').addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
$('navCollapse').addEventListener('click', () => {
  if (narrowNav()) setNavOpen(false);
  else setNavCollapsed(!document.body.classList.contains('nav-collapsed'));
});
$('navBackdrop').addEventListener('click', () => setNavOpen(false));

/* ==================== LANGUAGE & THEME ==================== */
function applyI18n() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = 'Print Zone Beta';
  qsa('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  qsa('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  qsa('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
  qsa('[data-svc-label]').forEach(el => { el.textContent = svcLabel(el.dataset.svcLabel); });
  qsa('[data-val-label]').forEach(el => { el.textContent = valLabel(el.dataset.valLabel); });
  qsa('[data-exp-label]').forEach(el => { el.textContent = EXP_LABELS[el.dataset.expLabel][lang]; });
  qsa('[data-pay-label]').forEach(el => { el.textContent = PAY_LABELS[el.dataset.payLabel][lang]; });
  const other = lang === 'ar' ? 'EN' : 'AR';
  $('langBtn').textContent = other; $('langLogin').textContent = other;
  $('langBtn').title = $('langLogin').title = lang === 'ar' ? 'English' : 'العربية';
  updateConnPill();
  updateClock();
  $('navVer').textContent = APP_VERSION;
  if (state.role) { updatePageTitle(); setRoleUi(); renderBadges(); onLangChange.forEach(fn => fn()); renderActivePage(); }
}
const onLangChange = [];
function toggleLang() { lang = lang === 'ar' ? 'en' : 'ar'; localStorage.setItem('pz_lang', lang); applyI18n(); }
/* The beta opens light unless dark was chosen; its choice is kept apart from the classic app's */
if (localStorage.getItem('pz_beta_theme') === 'dark') document.documentElement.classList.add('dark');
/* Light and dark mode each come in several shades of blue, chosen in Settings and kept per device */
const LIGHT_THEMES = [
  { k: 'classic', bg: '#ffffff', soft: '#f0f2f8', side: '#2363c7', accent: '#2363c7' },
  { k: 'sky', bg: '#ffffff', soft: '#eef4fb', side: '#3a8ee6', accent: '#2b7fd9' },
  { k: 'ocean', bg: '#ffffff', soft: '#edf4f7', side: '#0f6f9e', accent: '#0e78a8' },
  { k: 'navy', bg: '#ffffff', soft: '#eff2f8', side: '#1b3a73', accent: '#1f4590' },
  { k: 'steel', bg: '#ffffff', soft: '#f0f2f5', side: '#3d5a80', accent: '#3f6595' },
  { k: 'indigo', bg: '#ffffff', soft: '#f1f1fa', side: '#4549c7', accent: '#4a4fd6' },
];
const DARK_THEMES = [
  { k: 'midnight', bg: '#131c2e', soft: '#1b2640', side: '#1a4aa0', accent: '#3b7be0' },
  { k: 'navy', bg: '#0b1530', soft: '#13204a', side: '#163f9a', accent: '#3d7bf0' },
  { k: 'ocean', bg: '#0c1c29', soft: '#122838', side: '#11598a', accent: '#2a8bd0' },
  { k: 'steel', bg: '#151a22', soft: '#1e252f', side: '#2b4a78', accent: '#4a7fcf' },
  { k: 'royal', bg: '#13142d', soft: '#1b1d40', side: '#3439a3', accent: '#5a6cf0' },
  { k: 'abyss', bg: '#060a14', soft: '#0e1424', side: '#0f2c6a', accent: '#3470e0' },
];
{
  let l = null, d = null;
  try { l = localStorage.getItem('pz_beta_light'); d = localStorage.getItem('pz_beta_dark'); } catch (e) { /* private mode */ }
  document.documentElement.dataset.light = LIGHT_THEMES.some(x => x.k === l) ? l : 'classic';
  document.documentElement.dataset.dark = DARK_THEMES.some(x => x.k === d) ? d : 'midnight';
}
/* Picking a shade also switches to its mode, so the choice shows straight away */
function setThemeShade(mode, k) {
  document.documentElement.dataset[mode] = k;
  try { localStorage.setItem('pz_beta_' + mode, k); } catch (e) { /* private mode */ }
  if (document.documentElement.classList.contains('dark') !== (mode === 'dark')) toggleTheme();
  else if (state.page === 'pageDashboard') renderActivePage();
}
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('pz_beta_theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  if (state.page === 'pageDashboard') renderActivePage();
}
['langBtn', 'langLogin'].forEach(id => $(id).addEventListener('click', toggleLang));
['themeBtn', 'themeLogin'].forEach(id => $(id).addEventListener('click', toggleTheme));

/* Date and time in the top bar */
function updateClock() {
  const now = new Date(), loc = lang === 'ar' ? 'ar-EG' : 'en-GB';
  $('clock').textContent = now.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' +
    now.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
setInterval(updateClock, 15000);

/* Connection state shows as a dot on the avatar and as text in the account menu */
function updateConnPill() {
  const mode = !state.online ? 'local' : navigator.onLine ? 'online' : 'offline';
  document.body.dataset.conn = mode;
  $('connTxt').textContent = t('status.' + mode);
  $('userBtn').title = t('status.' + mode);
}
window.addEventListener('online', updateConnPill);
window.addEventListener('offline', updateConnPill);

/* Shared date-range filter for lists */
function inRange(date, range) {
  if (!date) return false;
  const today = todayStr();
  if (range === 'today') return date === today;
  if (range === 'week') return date >= addDays(today, -6) && date <= today;
  if (range === 'month') return date.slice(0, 7) === today.slice(0, 7);
  return true;
}
function setActiveChip(container, attr, value) { qsa('.chip', container).forEach(c => c.classList.toggle('active', c.dataset[attr] === value)); }
