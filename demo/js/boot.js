'use strict';
/* ==================== LOGIN ==================== */
let pendingRole = null;
function selectRole(role) {
  pendingRole = role;
  $('roleEmployee').classList.toggle('sel', role === 'employee');
  $('roleAdmin').classList.toggle('sel', role === 'admin');
  $('loginForm').hidden = false;
  $('loginError').textContent = '';
  $('loginPw').value = '';
  $('loginPw').focus();
}
$('roleEmployee').addEventListener('click', () => selectRole('employee'));
$('roleAdmin').addEventListener('click', () => selectRole('admin'));
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('loginPw').value;
  if (!pw) { $('loginError').textContent = t('login.enterPw'); return; }
  if (!pendingRole) return;
  const target = pendingRole === 'admin' ? state.settings.adminHash : state.settings.empHash;
  if (await hashPw(pw) === target) enterApp(pendingRole, true);
  else { $('loginError').textContent = t('login.wrong'); $('loginPw').value = ''; }
});

/* The session lasts until the tab closes, like the classic app (same key, so switching versions keeps you signed in) */
function enterApp(role, fresh) {
  state.role = role;
  sessionStorage.setItem('pz_session', role);
  $('loginView').hidden = true;
  $('appView').hidden = false;
  setRoleUi();
  qsa('.admin-only').forEach(el => { el.hidden = role !== 'admin'; });
  updateConnPill();
  initPos();
  go('pageNew');
  renderBadges();
  if (fresh) toast(t('toast.loginOk'));
}
$('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('pz_session');
  sessionStorage.removeItem('pz_session_admin');
  location.reload();
});

function updateLoginNote() {
  const note = $('loginNote');
  note.hidden = state.online;
  if (state.online) return;
  note.className = 'login-note ' + (state.initError ? 'err' : 'local');
  note.textContent = state.initError ? t(state.initError.key) + (state.initError.raw ? ' [' + state.initError.raw + ']' : '') : t('mode.local');
}
$('langLogin').addEventListener('click', updateLoginNote);

function classifyInitError(err) {
  const s = ((err && err.code) || '') + ' ' + ((err && err.message) || '');
  if (/operation-not-allowed|admin-restricted-operation|configuration-not-found|sign_in_provider|identitytoolkit/i.test(s)) return { key: 'err.auth', raw: err.code || '' };
  if (/permission-denied|insufficient permissions/i.test(s)) return { key: 'err.rules', raw: '' };
  if (/not-found|does not exist|NOT_FOUND/i.test(s)) return { key: 'err.notfound', raw: '' };
  return { key: 'err.generic', raw: (err && (err.code || err.message)) || '' };
}

/* ==================== BOOT ==================== */
(async function boot() {
  const start = Date.now();
  hydrateIcons();
  applyI18n();
  $('loginVer').textContent = APP_VERSION;
  $('loadingStatus').textContent = t('loading.connecting');
  try {
    if (getFbConfig()) {
      if (typeof firebase === 'undefined') throw { code: 'scripts', message: 'firebase scripts not loaded' };
      store = FireStore;
      await store.init();
    } else {
      store = LocalStore;
      await store.init();
    }
  } catch (err) {
    console.error('Firebase init failed, falling back to local:', err);
    state.initError = (err && err.code === 'scripts') ? { key: 'err.scripts', raw: '' } : classifyInitError(err);
    state.online = false;
    store = LocalStore;
    await store.init();
  }
  updateLoginNote();
  const wait = 450 - (Date.now() - start);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  $('loadingView').classList.add('hidden');
  setTimeout(() => { $('loadingView').hidden = true; }, 300);
  const sess = sessionStorage.getItem('pz_session') || (sessionStorage.getItem('pz_session_admin') === '1' ? 'admin' : null);
  if (sess === 'admin' || sess === 'employee') enterApp(sess, false);
  else $('loginView').hidden = false;
})();
