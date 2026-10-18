// /api 함수들이 같이 쓰는 도구. 밑줄(_)로 시작해서 주소로는 열리지 않는다.
// 키와 비밀번호는 환경변수 이름으로만 읽는다. 값은 어디에도 적지 않는다.
const crypto = require('node:crypto');
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

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

// 모두 같이 쓰는 공용 비밀번호(Vercel 환경변수 ADMIN_PASSWORD) 확인.
// 맞으면 null, 아니면 이미 응답을 보낸 뒤 true를 돌려준다.
function guard(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) { res.status(500).json({ error: 'Vercel 환경변수에 ADMIN_PASSWORD를 넣고 Redeploy 해 주세요.' }); return true; }
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  if (!crypto.timingSafeEqual(h(req.headers['x-password'] || ''), h(pass))) { res.status(401).json({ error: '비밀번호가 맞지 않아요.' }); return true; }
  if (!ready()) { res.status(500).json({ error: 'Supabase 연결 정보가 없어요.' }); return true; }
  return false;
}

// 있는 지점인지 확인하고 { id, name } 을 돌려준다. 없으면 null.
async function findBranch(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return null;
  const r = await sb(`branches?id=eq.${n}&select=id,name`);
  return r.ok && r.data && r.data[0] ? r.data[0] : null;
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// 퇴근 − 출근(분). 퇴근이 더 이르면 다음 날 퇴근으로 본다. 같으면 0(잘못된 값).
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

module.exports = { sb, readBody, guard, findBranch, DATE_RE, MONTH_RE, TIME_RE, minutesBetween, monthRange };
