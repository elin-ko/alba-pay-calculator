// 기록 저장. 직원마다 출근·퇴근 시각을 받아 일한 시간(분)을 계산해 넣는다.
// 두 칸을 모두 비우면 그날 그 직원의 기록을 지운다(직접 비운 경우).
const { sb, readBody, guard, findBranch, DATE_RE, TIME_RE, minutesBetween } = require('./_lib');

module.exports = async (req, res) => {
  if (guard(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });

  const b = readBody(req);
  const branch = await findBranch(b.branch_id);
  if (!branch) return res.status(400).json({ error: '지점을 골라 주세요.' });
  // 하루 화면은 date 하나 + entries, 한 달 표 화면은 entries마다 date를 같이 보낸다
  const baseDate = String(b.date || '');
  const entries = Array.isArray(b.entries) ? b.entries.slice(0, 2000) : [];

  // 고른 지점 직원만 저장할 수 있다
  const staff = await sb(`staff?branch_id=eq.${branch.id}&select=id,name`);
  if (!staff.ok) return res.status(500).json({ error: '직원 목록을 불러오지 못했어요.' });
  const names = new Map(staff.data.map((s) => [s.id, s.name]));
  const label = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

  const upserts = [];
  const clears = new Map(); // 날짜 → 비울 직원 id들
  for (const e of entries) {
    const id = Number(e.staff_id);
    const date = String(e.date || baseDate);
    if (!DATE_RE.test(date)) return res.status(400).json({ error: '날짜가 올바르지 않아요.' });
    if (!names.has(id)) return res.status(400).json({ error: '이 지점 직원이 아닌 기록이 있어요. 새로고침 후 다시 해 주세요.' });
    const start = String(e.start || ''), end = String(e.end || '');
    if (!start && !end) { clears.set(date, [...(clears.get(date) || []), id]); continue; }
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return res.status(400).json({ error: `${label(date)} ${names.get(id)} 님의 출근·퇴근 시각을 둘 다 적어 주세요.` });
    const minutes = minutesBetween(start, end);
    if (minutes === 0) return res.status(400).json({ error: `${label(date)} ${names.get(id)} 님의 출근과 퇴근 시각이 같아요.` });
    upserts.push({ branch_id: branch.id, staff_id: id, work_date: date, start_time: start, end_time: end, minutes, updated_at: new Date().toISOString() });
  }

  if (upserts.length) {
    const r = await sb('shifts?on_conflict=staff_id,work_date', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(upserts),
    });
    if (!r.ok) return res.status(500).json({ error: '저장하지 못했어요. 잠시 뒤 다시 해 주세요.' });
  }
  let cleared = 0;
  for (const [date, ids] of clears) {
    const r = await sb(`shifts?branch_id=eq.${branch.id}&work_date=eq.${date}&staff_id=in.(${ids.join(',')})`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    });
    if (!r.ok) return res.status(500).json({ error: '비운 기록을 정리하지 못했어요.' });
    cleared += ids.length;
  }
  return res.status(200).json({ ok: true, saved: upserts.length, cleared });
};
