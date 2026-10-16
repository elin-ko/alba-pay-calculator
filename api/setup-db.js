// 한 번만 쓰는 표 만들기 통로 — 표가 생기면 이 파일은 지운다. 데이터는 읽지도 보내지도 않는다.
const { Client } = require('pg');
const SQL = `
create table if not exists public.branches (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.managers (
  user_id uuid primary key,
  email text not null,
  branch_id bigint not null references public.branches(id),
  created_at timestamptz not null default now()
);
create table if not exists public.staff (
  id bigint generated always as identity primary key,
  branch_id bigint not null references public.branches(id),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.shifts (
  id bigint generated always as identity primary key,
  branch_id bigint not null references public.branches(id),
  staff_id bigint not null references public.staff(id),
  work_date date not null,
  start_time time not null,
  end_time time not null,
  minutes int not null check (minutes > 0 and minutes < 1440),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (staff_id, work_date)
);
create index if not exists shifts_branch_date on public.shifts (branch_id, work_date);
alter table public.branches enable row level security;
alter table public.managers enable row level security;
alter table public.staff enable row level security;
alter table public.shifts enable row level security;
revoke all on public.branches, public.managers, public.staff, public.shifts from anon, authenticated;
`;
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) return res.status(500).json({ error: '데이터베이스 연결 정보가 없어요. Vercel Storage에서 Supabase를 연결해 주세요.' });
  const client = new Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  try { await client.connect(); await client.query(SQL); return res.status(200).json({ ok: true }); }
  catch (e) { return res.status(500).json({ error: '표를 만들지 못했어요', detail: String(e.message).slice(0, 200) }); }
  finally { await client.end().catch(() => {}); }
};
