// 모두 같이 쓰는 공용 비밀번호. sessionStorage에만 둔다(탭을 닫으면 다시 입력).
// 고른 지점은 이 기기에 기억해 둔다(localStorage, 편의용).
const Auth = (() => {
  const KEY = 'store_hours_pw';
  const BRANCH = 'store_hours_branch';
  const get = (store, k) => { try { return store.getItem(k) || ''; } catch { return ''; } };
  const set = (store, k, v) => { try { v ? store.setItem(k, v) : store.removeItem(k); } catch {} };

  const password = () => get(sessionStorage, KEY);
  const signedIn = () => Boolean(password());

  async function call(path, opts = {}, pw = password()) {
    return fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), 'x-password': pw } });
  }

  // 비밀번호가 맞는지 서버에 물어보고, 맞으면 기억한다
  async function login(pw) {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = await call('/api/data?date=' + today, {}, pw);
    if (r.status === 401) throw new Error('비밀번호가 맞지 않아요.');
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || '문제가 생겼어요. 잠시 뒤 다시 해 주세요.'); }
    set(sessionStorage, KEY, pw);
  }
  function logout() {
    set(sessionStorage, KEY, '');
    location.href = '/';
  }

  async function api(path, opts = {}) {
    if (!signedIn()) { location.href = '/'; throw new Error('비밀번호를 넣어 주세요.'); }
    const r = await call(path, opts);
    if (r.status === 401) { logout(); throw new Error('비밀번호를 다시 넣어 주세요.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '문제가 생겼어요. 잠시 뒤 다시 해 주세요.');
    return j;
  }

  return {
    login, logout, api, signedIn,
    branch: () => get(localStorage, BRANCH),
    setBranch: (id) => set(localStorage, BRANCH, String(id || '')),
  };
})();
