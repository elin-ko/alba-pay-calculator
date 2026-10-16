// 점장 로그인(Supabase Auth). 브라우저에는 공개 키만 쓰고, 그 키도 /api/auth-config에서 받아 온다.
// 로그인 표는 sessionStorage에만 둔다(탭을 닫으면 로그아웃).
const Auth = (() => {
  const KEY = 'store_hours_session';
  let cfg = null;

  async function config() {
    if (cfg) return cfg;
    const r = await fetch('/api/auth-config');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '로그인 설정을 불러오지 못했어요.');
    cfg = j;
    return cfg;
  }
  function session() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
  }
  function save(s) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token })); } catch {}
  }
  function clear() {
    try { sessionStorage.removeItem(KEY); } catch {}
  }
  async function authFetch(path, body, token) {
    const { url, key } = await config();
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${url}/auth/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  }

  async function login(email, password) {
    const r = await authFetch('token?grant_type=password', { email, password });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error('이메일 또는 비밀번호가 맞지 않아요.');
    save(j);
  }
  async function refresh() {
    const s = session();
    if (!s || !s.refresh_token) return false;
    const r = await authFetch('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) return false;
    save(j);
    return true;
  }
  async function logout() {
    const s = session();
    if (s) await authFetch('logout', {}, s.access_token).catch(() => {});
    clear();
    location.href = '/';
  }

  // 우리 /api 호출. 로그인 표가 만료되면 한 번 새로 받고, 그래도 안 되면 로그인 화면으로.
  async function api(path, opts = {}) {
    const call = () => {
      const s = session();
      if (!s) return null;
      return fetch(path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), Authorization: `Bearer ${s.access_token}` },
      });
    };
    let r = await call();
    if (r && r.status === 401 && (await refresh())) r = await call();
    if (!r || r.status === 401) {
      clear();
      location.href = '/';
      throw new Error('다시 로그인해 주세요.');
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '문제가 생겼어요. 잠시 뒤 다시 해 주세요.');
    return j;
  }

  return { login, logout, api, session };
})();
