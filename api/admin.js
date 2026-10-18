// 사장님 화면(/admin): 관리자 비밀번호(ADMIN_PASSWORD) 확인 후
// GET  ?month=YYYY-MM → 지점·점장·직원·그 달 지점별 근무시간
// POST {action:'branch', name}            → 지점 추가
// POST {action:'manager', email, branch_id} → 점장 계정 만들기(임시 비밀번호를 한 번만 돌려줌)
// POST {action:'reset', user_id}          → 점장 비밀번호 새로 만들기
const crypto = require('node:crypto');
const { SB_URL, sbHeaders, sb, readBody, ready, MONTH_RE, monthRange, noStore } = require('./_lib');

const same = (a, b) => {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};
// 점장 비밀번호: 사장님이 정한 값(Vercel 환경변수 MANAGER_PASSWORD)이 있으면 모두 그 값으로.
// 없으면 헷갈리는 글자(0/O, 1/l/I)를 뺀 12자 임시 비밀번호. 값은 코드에 적지 않는다(공개 저장소).
const tempPassword = () => {
  if (process.env.MANAGER_PASSWORD) return process.env.MANAGER_PASSWORD;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(12), (x) => chars[x % chars.length]).join('');
};

module.exports = async (req, res) => {
  noStore(res);
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return res.status(500).json({ error: 'Vercel 환경변수에 ADMIN_PASSWORD를 넣고 Redeploy 해 주세요.' });
  if (!same(req.headers['x-admin-password'] || '', pass)) return res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
  if (!ready()) return res.status(500).json({ error: 'Supabase 연결 정보가 없어요.' });

  if (req.method === 'GET') {
    const month = String(req.query.month || '');
    if (!MONTH_RE.test(month)) return res.status(400).json({ error: '달이 올바르지 않아요.' });
    const [from, to] = monthRange(month);
    const [branches, managers, staff, shifts] = await Promise.all([
      sb('branches?select=id,name&order=name.asc'),
      sb('managers?select=user_id,email,branch_id&order=email.asc'),
      sb('staff?select=id,branch_id,name,active&order=name.asc'),
      sb(`shifts?work_date=gte.${from}&work_date=lt.${to}&select=staff_id,branch_id,minutes`),
    ]);
    if (![branches, managers, staff, shifts].every((r) => r.ok)) return res.status(500).json({ error: '불러오지 못했어요.' });
    return res.status(200).json({ month, branches: branches.data, managers: managers.data, staff: staff.data, shifts: shifts.data });
  }

  if (req.method === 'POST') {
    const b = readBody(req);

    if (b.action === 'branch') {
      const name = String(b.name || '').trim().slice(0, 40);
      if (!name) return res.status(400).json({ error: '지점 이름을 적어 주세요.' });
      const r = await sb('branches', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name }) });
      if (r.status === 409) return res.status(400).json({ error: '이미 있는 지점 이름이에요.' });
      if (!r.ok) return res.status(500).json({ error: '지점을 추가하지 못했어요.' });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'rename') {
      const id = Number(b.branch_id);
      const name = String(b.name || '').trim().slice(0, 40);
      if (!Number.isInteger(id)) return res.status(400).json({ error: '잘못된 요청이에요.' });
      if (!name) return res.status(400).json({ error: '새 지점 이름을 적어 주세요.' });
      const r = await sb(`branches?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name }) });
      if (r.status === 409) return res.status(400).json({ error: '이미 있는 지점 이름이에요.' });
      if (!r.ok) return res.status(500).json({ error: '이름을 바꾸지 못했어요.' });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'manager') {
      const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
      const branchId = Number(b.branch_id);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '이메일을 확인해 주세요.' });
      const br = await sb(`branches?id=eq.${branchId}&select=id`);
      if (!Number.isInteger(branchId) || !br.ok || !br.data[0]) return res.status(400).json({ error: '지점을 골라 주세요.' });
      const password = tempPassword();
      const u = await fetch(`${SB_URL}/auth/v1/admin/users`, {
        method: 'POST', headers: sbHeaders(),
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      const user = await u.json().catch(() => ({}));
      if (!u.ok || !user.id) {
        const exists = u.status === 422 || /already/i.test(JSON.stringify(user));
        return res.status(400).json({ error: exists ? '이미 계정이 있는 이메일이에요.' : '계정을 만들지 못했어요.' });
      }
      const m = await sb('managers', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: user.id, email, branch_id: branchId }) });
      if (!m.ok) return res.status(500).json({ error: '계정은 만들었지만 지점 연결에 실패했어요. 다시 시도해 주세요.' });
      return res.status(200).json({ ok: true, email, password });
    }

    if (b.action === 'reset') {
      const id = String(b.user_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: '잘못된 요청이에요.' });
      const m = await sb(`managers?user_id=eq.${id}&select=email`);
      if (!m.ok || !m.data[0]) return res.status(400).json({ error: '점장 계정을 찾지 못했어요.' });
      const password = tempPassword();
      const u = await fetch(`${SB_URL}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: sbHeaders(), body: JSON.stringify({ password }) });
      if (!u.ok) return res.status(500).json({ error: '비밀번호를 바꾸지 못했어요.' });
      return res.status(200).json({ ok: true, email: m.data[0].email, password });
    }

    return res.status(400).json({ error: '잘못된 요청이에요.' });
  }

  return res.status(405).json({ error: '지원하지 않는 요청이에요.' });
};
