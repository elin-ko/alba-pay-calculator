// 하루 기록 저장. 직원마다 출근·퇴근 시각을 받아 일한 시간(분)을 계산해 넣는다.
// 두 칸을 모두 비우면 그날 그 직원의 기록을 지운다(점장이 직접 비운 경우).
const { sb, readBody, ready, currentManager, DATE_RE, TIME_RE, minutesBetween, noStore } = require('./_lib');

module.exports = async (req, res) => {
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  if (!ready()) return res.status(500).json({ error: 'Supabase 연결 정보가 없어요.' });
  const me = await currentManager(req);
  if (!me) return res.status(401).json({ error: '다시 로그인해 주세요.' });
  if (!me.branch_id) return res.status(403).json({ error: '이 계정에 연결된 지점이 없어요. 사장님께 말씀해 주세요.' });

  const b = readBody(req);
  const date = String(b.date || '');
  if (!DATE_RE.test(date)) return res.status(400).json({ error: '날짜가 올바르지 않아요.' });
  const entries = Array.isArray(b.entries) ? b.entries.slice(0, 200) : [];

  // 내 지점 직원만 저장할 수 있다
  const staff = await sb(`staff?branch_id=eq.${me.branch_id}&select=id,name`);
  if (!staff.ok) return res.status(500).json({ error: '직원 목록을 불러오지 못했어요.' });
  const names = new Map(staff.data.map((s) => [s.id, s.name]));

  const upserts = [];
  const clears = [];
  for (const e of entries) {
    const id = Number(e.staff_id);
    if (!names.has(id)) return res.status(400).json({ error: '우리 지점 직원이 아닌 기록이 있어요. 새로고침 후 다시 해 주세요.' });
    const start = String(e.start || ''), end = String(e.end || '');
    if (!start && !end) { clears.push(id); continue; }
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return res.status(400).json({ error: `${names.get(id)} 님의 출근·퇴근 시각을 둘 다 적어 주세요.` });
    const minutes = minutesBetween(start, end);
    if (minutes === 0) return res.status(400).json({ error: `${names.get(id)} 님의 출근과 퇴근 시각이 같아요.` });
    upserts.push({ branch_id: me.branch_id, staff_id: id, work_date: date, start_time: start, end_time: end, minutes, updated_at: new Date().toISOString(), updated_by: me.user.id });
  }

  if (upserts.length) {
    const r = await sb('shifts?on_conflict=staff_id,work_date', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(upserts),
    });
    if (!r.ok) return res.status(500).json({ error: '저장하지 못했어요. 잠시 뒤 다시 해 주세요.' });
  }
  if (clears.length) {
    const r = await sb(`shifts?branch_id=eq.${me.branch_id}&work_date=eq.${date}&staff_id=in.(${clears.join(',')})`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    });
    if (!r.ok) return res.status(500).json({ error: '비운 기록을 정리하지 못했어요.' });
  }
  return res.status(200).json({ ok: true, saved: upserts.length, cleared: clears.length });
};
