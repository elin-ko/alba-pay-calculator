// /api 함수들이 같이 쓰는 도구. 밑줄(_)로 시작해서 주소로는 열리지 않는다.
// 키는 환경변수 이름으로만 읽는다. 값은 어디에도 적지 않는다.
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const sbHeaders = () => ({
  apikey: SB_KEY,
  ...(String(SB_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}),
  'Content-Type': 'application/json',
});

// Supabase 표(REST) 호출
async function sb(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: { ...sbHeaders(), ...(opts.headers || {}) } });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { ok: r.ok, status: r.status, data };
}

function readBody(req) {
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b;
}

const ready = () => Boolean(SB_URL && SB_KEY);

// 로그인한 점장인지 확인하고, 그 점장의 지점을 돌려준다. 아니면 null.
async function currentManager(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY || SB_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const user = await r.json();
  if (!user || !user.id) return null;
  const m = await sb(`managers?user_id=eq.${encodeURIComponent(user.id)}&select=branch_id,branches(name)`);
  if (!m.ok || !m.data || !m.data[0]) return { user, branch_id: null };
  return { user, branch_id: m.data[0].branch_id, branch_name: m.data[0].branches ? m.data[0].branches.name : '' };
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// 퇴근 − 출근(분). 퇴근이 더 이르면 다음 날 퇴근으로 본다. 같으면 잘못된 값.
function minutesBetween(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let d = eh * 60 + em - (sh * 60 + sm);
  if (d < 0) d += 1440;
  return d;
}

// 'YYYY-MM' → ['YYYY-MM-01', 다음 달 1일]
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

module.exports = { SB_URL, SB_KEY, sbHeaders, sb, readBody, ready, currentManager, DATE_RE, MONTH_RE, TIME_RE, minutesBetween, monthRange, noStore };
