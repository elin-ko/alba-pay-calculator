// 지점 관리(/admin): 공용 비밀번호 확인 후
// GET  ?month=YYYY-MM                → 지점·직원·그 달 지점별 근무시간
// POST {action:'branch', name}       → 지점 추가
// POST {action:'rename', branch_id, name} → 지점 이름 바꾸기
const { sb, readBody, guard, MONTH_RE, monthRange } = require('./_lib');

module.exports = async (req, res) => {
  if (guard(req, res)) return;

  if (req.method === 'GET') {
    const month = String(req.query.month || '');
    if (!MONTH_RE.test(month)) return res.status(400).json({ error: '달이 올바르지 않아요.' });
    const [from, to] = monthRange(month);
    const [branches, staff, shifts] = await Promise.all([
      sb('branches?select=id,name&order=name.asc'),
      sb('staff?select=id,branch_id,name,active&order=name.asc'),
      sb(`shifts?work_date=gte.${from}&work_date=lt.${to}&select=staff_id,branch_id,minutes`),
    ]);
    if (![branches, staff, shifts].every((r) => r.ok)) return res.status(500).json({ error: '불러오지 못했어요.' });
    return res.status(200).json({ month, branches: branches.data, staff: staff.data, shifts: shifts.data });
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

    return res.status(400).json({ error: '잘못된 요청이에요.' });
  }

  return res.status(405).json({ error: '지원하지 않는 요청이에요.' });
};
