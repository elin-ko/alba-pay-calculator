// 점장 화면에 필요한 것: 내 지점 이름, 직원 목록, 고른 날짜가 들어 있는 달의 근무기록
const { sb, ready, currentManager, DATE_RE, monthRange, noStore } = require('./_lib');

module.exports = async (req, res) => {
  noStore(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 가능해요' });
  if (!ready()) return res.status(500).json({ error: 'Supabase 연결 정보가 없어요. Vercel Storage 연결 후 다시 배포해 주세요.' });
  const me = await currentManager(req);
  if (!me) return res.status(401).json({ error: '다시 로그인해 주세요.' });
  if (!me.branch_id) return res.status(403).json({ error: '이 계정에 연결된 지점이 없어요. 사장님께 말씀해 주세요.' });

  const date = String(req.query.date || '');
  if (!DATE_RE.test(date)) return res.status(400).json({ error: '날짜가 올바르지 않아요.' });
  const month = date.slice(0, 7);
  const [from, to] = monthRange(month);
  const b = me.branch_id;

  const [staff, shifts] = await Promise.all([
    sb(`staff?branch_id=eq.${b}&select=id,name,active&order=active.desc,name.asc`),
    sb(`shifts?branch_id=eq.${b}&work_date=gte.${from}&work_date=lt.${to}&select=staff_id,work_date,start_time,end_time,minutes&order=work_date.asc`),
  ]);
  if (!staff.ok || !shifts.ok) return res.status(500).json({ error: '불러오지 못했어요. 잠시 뒤 다시 해 주세요.' });

  return res.status(200).json({
    branch: { id: b, name: me.branch_name },
    email: me.user.email,
    date,
    month,
    staff: staff.data,
    shifts: shifts.data,
  });
};
