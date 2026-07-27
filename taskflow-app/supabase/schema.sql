-- ============================================================
-- TaskFlow (iQUVE 외주 업무 관리) DB 스키마
-- Supabase SQL Editor에서 순서대로 실행하세요.
-- ============================================================

create extension if not exists "pgcrypto";

-- 1) profiles: auth.users 확장
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text not null,
  role text not null check (role in ('manager', 'contractor')),
  specialty text default '',
  note text default '',
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2) major_categories: 대분류 (영어시리즈 제작 / 한글시리즈 제작 / 한글싱글북 등, 구글시트의 "시트"에 해당)
create table if not exists major_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 3) categories: 업무 카테고리 (리디자인, 4K 업스케일 등)
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);

-- 4) projects: 대분류 안에서 운영되는 동화책 제작 프로젝트
-- upload_status: 'Not yet' | 'Complete'
-- upload_decision: null | 'confirmed' | 'declined'
-- review_status: 'Processing' | 'Revision(Kor)' | 'R-Complete' | 'Complete(Kor)'
-- volume_check: 'Checking' | 'Done' | 'Not yet'
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  major_category_id uuid not null references major_categories(id),
  volume_check text not null default 'Not yet',
  upload_status text not null default 'Not yet',
  upload_decision text,
  decline_reason text default '',
  review_status text not null default 'Processing',
  remark text default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(), -- D-day 계산 기준
  completed_at timestamptz,
  unique (major_category_id, code),
  unique (major_category_id, name)
);

-- 5) subheadings: 프로젝트별로 등록/관리되는 하위 항목 (1화, 2화, 표지 등)
create table if not exists subheadings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique (project_id, label)
);

-- 6) tasks: 실제 배정되는 업무 단위
-- status: 'waiting' | 'in_progress' | 'reviewing' | 'rework_notice' | 'done'
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  project_id uuid not null references projects(id) on delete cascade,
  category_id uuid not null references categories(id),
  subheading_id uuid references subheadings(id),
  contractor_id uuid not null references profiles(id),
  status text not null default 'waiting',
  start_date date,
  completed_date date,
  rework_acknowledged boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7) task_rework_notes: 재작업 요청 메시지 이력 (같은 업무에 여러 개 누적)
create table if not exists task_rework_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

-- 8) project_logs: 프로젝트/업무 관련 모든 변경 이력 (감사 추적 + "전체 프로젝트 로그" 화면용)
create table if not exists project_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  actor_id uuid references profiles(id),
  actor_name text not null,
  change text not null,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

-- updated_at 자동 갱신
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ============================================================
-- 기본 데이터 (대분류 3종 + 예시 카테고리)
-- ============================================================
insert into major_categories (label, sort_order) values
  ('영어시리즈 제작', 1),
  ('한글시리즈 제작', 2),
  ('한글싱글북', 3)
on conflict (label) do nothing;

insert into categories (label) values
  ('리디자인'), ('4K 업스케일'), ('신규 일러스트'), ('사운드 디자인'), ('표정팩')
on conflict (label) do nothing;

-- ============================================================
-- 이미 스키마를 실행하셨다면 (기존 DB에 적용할 경우) 아래 두 줄만 추가로 실행하세요.
-- ============================================================
-- alter table tasks alter column subheading_id drop not null;
-- alter table profiles add column if not exists must_change_password boolean not null default false;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table major_categories enable row level security;
alter table categories enable row level security;
alter table projects enable row level security;
alter table subheadings enable row level security;
alter table tasks enable row level security;
alter table task_rework_notes enable row level security;
alter table project_logs enable row level security;

-- profiles: 로그인한 사람은 전체 프로필을 볼 수 있음 (이름 표시용). 본인 것만 수정 가능은 서버에서 처리.
drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles for select using (auth.role() = 'authenticated');

-- 참고 데이터(대분류/카테고리/프로젝트/서브헤딩)는 로그인한 사람 전체 열람 가능.
-- 실제 쓰기(생성/수정/삭제)는 전부 서버의 API 라우트에서 service role 키로 처리하며,
-- 그 안에서 role='manager' 여부를 확인합니다. 아래 정책은 열람 전용 안전장치입니다.
drop policy if exists "major_categories_select" on major_categories;
create policy "major_categories_select" on major_categories for select using (auth.role() = 'authenticated');

drop policy if exists "categories_select" on categories;
create policy "categories_select" on categories for select using (auth.role() = 'authenticated');

drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects for select using (auth.role() = 'authenticated');

drop policy if exists "subheadings_select" on subheadings;
create policy "subheadings_select" on subheadings for select using (auth.role() = 'authenticated');

-- tasks: 외주 작업자는 본인 업무만, 담당자는 전체 조회
drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select using (
  contractor_id = auth.uid()
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);

drop policy if exists "task_rework_notes_select" on task_rework_notes;
create policy "task_rework_notes_select" on task_rework_notes for select using (
  exists (
    select 1 from tasks t where t.id = task_rework_notes.task_id
      and (t.contractor_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager'))
  )
);

drop policy if exists "project_logs_select_manager" on project_logs;
create policy "project_logs_select_manager" on project_logs for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);
