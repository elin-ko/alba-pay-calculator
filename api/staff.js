// 내 지점 직원 추가(POST) · 그만둠/다시 일함 표시(PATCH). 직원과 기록은 지우지 않는다.
const { sb, readBody, ready, currentManager, noStore } = require('./_lib');

module.exports = async (req, res) => {
  noStore(res);
  if (!ready()) return res.status(500).json({ error: 'Supabase 연결 정보가 없어요.' });
  const me = await currentManager(req);
  if (!me) return res.status(401).json({ error: '다시 로그인해 주세요.' });
  if (!me.branch_id) return res.status(403).json({ error: '이 계정에 연결된 지점이 없어요. 사장님께 말씀해 주세요.' });
  const b = readBody(req);

  if (req.method === 'POST') {
    const name = String(b.name || '').trim().slice(0, 30);
    if (!name) return res.status(400).json({ error: '직원 이름을 적어 주세요.' });
    const r = await sb('staff', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ branch_id: me.branch_id, name }) });
    if (!r.ok) return res.status(500).json({ error: '추가하지 못했어요.' });
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'PATCH') {
    const id = Number(b.id);
    if (!Number.isInteger(id) || typeof b.active !== 'boolean') return res.status(400).json({ error: '잘못된 요청이에요.' });
    const r = await sb(`staff?id=eq.${id}&branch_id=eq.${me.branch_id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: b.active }) });
    if (!r.ok) return res.status(500).json({ error: '바꾸지 못했어요.' });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: '지원하지 않는 요청이에요.' });
};
