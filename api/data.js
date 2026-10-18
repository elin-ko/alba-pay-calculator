// 화면에 필요한 것: 지점 목록, 고른 지점의 직원 목록, 고른 날짜가 들어 있는 달의 근무기록
// GET ?date=YYYY-MM-DD&branch_id=숫자 (branch_id가 없거나 없는 지점이면 ㄱㄴㄷ순 첫 지점)
const { sb, guard, findBranch, DATE_RE, monthRange } = require('./_lib');

module.exports = async (req, res) => {
  if (guard(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 가능해요' });

  const date = String(req.query.date || '');
  if (!DATE_RE.test(date)) return res.status(400).json({ error: '날짜가 올바르지 않아요.' });

  const all = await sb('branches?select=id,name');
  if (!all.ok) return res.status(500).json({ error: '지점을 불러오지 못했어요.' });
  const branches = all.data.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
  if (!branches.length) return res.status(200).json({ branches: [], branch: null, date, month: date.slice(0, 7), staff: [], shifts: [] });
  const branch = (await findBranch(req.query.branch_id)) || branches[0];

  const month = date.slice(0, 7);
  const [from, to] = monthRange(month);
  const [staff, shifts] = await Promise.all([
    sb(`staff?branch_id=eq.${branch.id}&select=id,name,active&order=active.desc,name.asc`),
    sb(`shifts?branch_id=eq.${branch.id}&work_date=gte.${from}&work_date=lt.${to}&select=staff_id,work_date,start_time,end_time,minutes&order=work_date.asc`),
  ]);
  if (!staff.ok || !shifts.ok) return res.status(500).json({ error: '불러오지 못했어요. 잠시 뒤 다시 해 주세요.' });

  return res.status(200).json({ branches, branch, date, month, staff: staff.data, shifts: shifts.data });
};
