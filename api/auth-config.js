// 로그인 창구용 공개 정보만 내려 준다. 서버 키는 절대 여기 넣지 않는다.
module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Supabase 공개 키가 없어요. Vercel Storage 연결 후 다시 배포해 주세요.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ url, key });
};
