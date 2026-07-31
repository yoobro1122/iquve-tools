# TaskFlow — 미디어팀 외주 업무 관리 시스템 (v1.05)

## v1.05 주요 변경사항

1. **일정 관리**: 좌측 "프로젝트 현황" 아래 "일정 관리" 메뉴 추가. 선택된 대분류(또는 전체보기) 안에서 외주 작업자별로 섹션이 나뉘고, 접으면 이름+건수만, 펼치면 대기중/진행중/완료(이번 주만) 업무가 나옵니다.
2. **업무 수정 강화**: 대기중(waiting) 업무에 한해 외주 작업자와 등록일시를 바로 바꿀 수 있습니다. 등록일을 미래로 바꾸면 그 시각에 알림 메일이 다시 나갑니다. (이미 시작된 업무는 기존처럼 검수 화면의 "인계"로만 작업자를 바꿀 수 있습니다.)
3. **완료 업무 재작업**: 완료된 업무 카드 우측 상단 연필 아이콘 → "재작업 요청"(동일 작업자) 또는 "다른 작업자에게 인계" 선택 가능. 여러 번 반복 가능하며 매번 별도 구간(시간/평점)이 기록됩니다. 재진행 중에는 상태 옆에 "(재진행)" 표시, 재시작/재종료 시각이 별도로 표시됩니다.
   - 자동으로 멈추는 로직은 없습니다 — 재작업 중인 업무보다 순서가 늦은 업무가 이미 진행 중이면 카드에 경고 배지가 뜨고, 전체 로그와 메일로도 알려드립니다. 직접 판단해서 조치해주세요.
4. **카테고리 순서**: 카테고리 목록에 순서(위/아래 화살표)가 생겼습니다. 같은 에피소드 안에서 앞 순서 카테고리의 업무가 전부 완료되어야 다음 순서 업무의 "업무 시작" 버튼이 활성화되고, 활성화되는 순간 담당 작업자에게 메일이 갑니다.
5. **AI 서비스 크레딧 관리**: 외주 작업자 관리 화면에서 작업자별로 AI 서비스 계정(잔여 크레딧)을 등록할 수 있습니다. 업무 종료 시 사용한 서비스를 선택하고 지금 남은 크레딧을 입력하면 자동으로 소진량이 계산되어 기록됩니다. 크레딧이 0이 되면 전체 로그에 경고가 남고, "AI 크레딧 알림 받기"를 켜둔 담당자에게 메일이 갑니다 (아무도 안 켜뒀다면 전체 담당자에게 발송).
6. **정렬 기능**: 프로젝트 현황의 프로젝트 목록과, 펼쳤을 때 나오는 업무 구간 목록 둘 다 열 제목을 클릭하면 오름차순/내림차순으로 정렬됩니다.
7. **상태값 정리**: 음량 확인 Not yet/Complete(회색/녹색), 업로드 확인 Not yet/Complete(회색/녹색), 검수 상태 Not yet/Revision/Complete(회색/노랑/녹색)로 단순화했습니다.

### v1.05 마이그레이션 (필수, 순서대로 실행)

```sql
-- 1. 상태값 값 변환 (기존 데이터가 있는 경우)
update projects set volume_check = 'Complete' where volume_check = 'Done';
update projects set volume_check = 'Not yet' where volume_check = 'Checking';
update projects set review_status = 'Not yet' where review_status = 'Processing';
update projects set review_status = 'Revision' where review_status in ('Revision(Kor)', 'R-Complete');
update projects set review_status = 'Complete' where review_status = 'Complete(Kor)';

-- 2. 카테고리 순서 + 업무 재오픈/순서알림 + AI 크레딧 알림 옵트인
alter table categories add column if not exists sort_order int not null default 0;
alter table profiles add column if not exists ai_credit_alert_opt_in boolean not null default false;
alter table tasks add column if not exists reopen_count int not null default 0;
alter table tasks add column if not exists order_unlock_notified boolean not null default false;
alter table task_assignments add column if not exists is_rework boolean not null default false;

-- 3. tasks_select 정책 교체 (참여했던 업무 조회 허용 - 이미 v1.04에서 적용하셨다면 생략)
drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select using (
  contractor_id = auth.uid()
  or exists (select 1 from task_assignments ta where ta.task_id = tasks.id and ta.contractor_id = auth.uid())
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);

-- 4. AI 서비스 / 크레딧 테이블
create table if not exists ai_services (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists contractor_ai_accounts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references profiles(id) on delete cascade,
  ai_service_id uuid not null references ai_services(id) on delete cascade,
  account_label text default '',
  remaining_credit numeric not null default 0,
  updated_at timestamptz not null default now()
);
alter table task_assignments add column if not exists ai_account_id uuid references contractor_ai_accounts(id) on delete set null;
alter table task_assignments add column if not exists credit_used numeric;
alter table ai_services enable row level security;
alter table contractor_ai_accounts enable row level security;
create policy "ai_services_select" on ai_services for select using (auth.role() = 'authenticated');
create policy "contractor_ai_accounts_select" on contractor_ai_accounts for select using (
  contractor_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);
```

⚠️ **카테고리 순서 관련 참고**: 마이그레이션 직후엔 모든 카테고리의 `sort_order`가 0으로 동일합니다. "업무 등록" 모달의 카테고리 목록에서 위/아래 화살표로 원하시는 순서로 한 번 정리해주세요 (그래야 "이전 순서 완료 전 시작 불가" 로직이 의도한 대로 동작합니다). 순서를 아직 안 정하셨다면 모든 업무가 항상 시작 가능한 것으로 처리됩니다 (제한 없음).

## v1.04 주요 변경사항 (업무 인계 / 서브 담당자)

1. **업무 인계**: 검수 화면에 "검수 확인 / 재작업 요청 / 다른 작업자에게 인계" 세 가지 선택지가 생겼습니다. 인계하면 이전 작업자의 구간이 마감되고, 새 작업자가 "업무 시작"을 눌러야 본인 구간이 새로 시작됩니다.
2. **구간별 기록**: 업무 하나가 여러 작업자를 거칠 수 있어, 각 작업자의 시작/종료 시각·제출 파일·평점을 구간(차수)별로 따로 기록합니다 (`task_assignments` 테이블). 비용 지급 자료로 그대로 활용 가능합니다.
3. **서브 담당자(참조)**: 업무 등록/수정 시 메인 담당자 외에 여러 명을 참조로 지정할 수 있습니다. 참조는 검수 권한 없이 "확인 + 의견"만 남기며, 확인 시 메인 담당자에게 메일이 갑니다.
4. **알림 확대**: 모든 업무 알림 메일이 메인 담당자 + 서브 담당자 전원에게 함께 발송됩니다.
5. **외주 작업자 화면 3분할**: 내 업무 / 완료된 업무 / 참여했던 업무(인계로 넘어간 과거 구간, 읽기 전용)로 나뉘어 표시됩니다.
6. **프로젝트 현황**: 업무를 펼치면 이제 차수(1차/2차...)별로 담당 작업자·시작/종료·작업시간·평점이 나뉘어 표시되고, 평점도 구간별로 매길 수 있습니다. 엑셀 다운로드도 같은 방식으로 세분화됩니다.

### v1.04 마이그레이션 (필수, 순서대로 실행)

```sql
-- 1. 새 테이블 먼저 생성
create table if not exists task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  contractor_id uuid not null references profiles(id),
  started_at timestamptz,
  ended_at timestamptz,
  file_link text default '',
  rating int check (rating between 1 and 5),
  handoff_reason text default '',
  created_at timestamptz not null default now()
);
create table if not exists task_sub_managers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  manager_id uuid not null references profiles(id),
  acknowledged boolean not null default false,
  comment text default '',
  created_at timestamptz not null default now(),
  unique (task_id, manager_id)
);

-- 2. 기존 tasks의 시작/종료/파일링크/평점 데이터를 새 테이블로 이전
insert into task_assignments (task_id, contractor_id, started_at, ended_at, file_link, rating, created_at)
  select id, contractor_id, start_date, completed_date, file_link, rating, created_at from tasks;

-- 3. 이전이 끝난 뒤 tasks의 옛 컬럼 삭제
alter table tasks drop column if exists start_date;
alter table tasks drop column if exists completed_date;
alter table tasks drop column if exists file_link;
alter table tasks drop column if exists rating;

-- 4. RLS 설정
alter table task_assignments enable row level security;
alter table task_sub_managers enable row level security;
create policy "task_assignments_select" on task_assignments for select using (
  contractor_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);
create policy "task_sub_managers_select" on task_sub_managers for select using (
  manager_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager')
);
```

⚠️ 위 마이그레이션은 **기존에 tasks 테이블에 start_date/completed_date/file_link/rating 컬럼이 있던 경우**를 위한 것입니다. 처음 설치하시는 경우라면 `supabase/schema.sql`을 그대로 실행하시면 되고 위 SQL은 필요 없습니다.

## v1.03 주요 변경사항

1. **등록일 시:분 지정**: 업무 등록 시 날짜뿐 아니라 시:분까지 지정할 수 있습니다. 지정한 시각에 등록 알림 메일이 발송됩니다 (크론이 10분 간격으로 확인).
2. **작업자별 전체 업무 열람**: 외주 작업자 관리에서 이름을 클릭하면 그 작업자의 모든 업무(준비 중/진행 중/완료)를 모달로 확인할 수 있습니다.

## v1.02 주요 변경사항

1. **시간 표시**: 업무 시작일/종료일에 시:분까지 표시됩니다. "작업일수" 대신 실제 걸린 "작업시간"(N시간 M분)을 보여줍니다.
2. **업무 평점**: 프로젝트 현황에서 프로젝트를 펼치면 업무별로 1~5점 평점을 매길 수 있습니다 (해당 업무를 수행한 외주 작업자에게 귀속). 프로젝트 현황 메뉴는 담당자에게만 보이고 외주 작업자에게는 보이지 않습니다.
3. **작업자 통계**: 외주 작업자 관리 화면에서 작업자별 총 완료 업무 건수, 평균 작업시간, 평균 평점을 확인할 수 있습니다.
4. **이메일 발송 오류 수정**: Resend가 실패 시 예외를 던지지 않고 결과에 에러를 담아 반환하는데, 이를 확인하지 않던 버그를 고쳐 실패가 서버 로그에 정확히 남도록 했습니다.
5. **전체 로그 복원**: 헤더의 "전체 로그" 버튼으로 모든 프로젝트의 변경 이력을 한 번에 볼 수 있습니다 (담당자 전용).

Next.js + Supabase + Resend로 만든 실제 서비스용 앱입니다.

## v1.01 주요 변경사항

1. **작업 파일 링크**: 업무 종료/수정완료 시 작업 파일 링크 입력이 필수이며, 담당자가 카드에서 바로 확인할 수 있습니다.
2. **에피소드**: subheading을 대체하는 "에피소드" 기능. 프로젝트 헤더 아래에 에피소드 탭이 있고, 클릭하면 해당 에피소드 업무만 표시됩니다. "수정" 버튼으로 추가/이름수정/삭제.
3. **업무 시작일 예약 + 메모**: 업무 등록 시 시작일(기본값 오늘)과 메모를 입력할 수 있습니다. 시작일을 미래로 바꾸면 그 날짜 00시(KST)에 등록 알림 메일이 자동 발송되고, 메모도 함께 전달됩니다.
4. **프로젝트 현황 확장 + 엑셀 다운로드**: 프로젝트명을 누르면 에피소드별 업무/작업자/담당자/시작일/종료일/작업일수가 펼쳐지고, "엑셀 다운로드"로 프로젝트를 선택해 xlsx 파일로 받을 수 있습니다.
5. **삭제 처리 개선**: 비활성화(삭제)된 업무는 프로젝트의 "모든 업무 완료" 판정에서 제외됩니다. 삭제된 프로젝트/업무 목록에 "완전 삭제" 버튼이 추가되어 DB에서 영구 삭제할 수 있습니다 (되돌릴 수 없음).
6. **작업자 재배정 알림**: 업무 수정으로 외주 작업자를 변경하면 새로 배정된 작업자에게 메일이 발송됩니다.
7. **전체 보기에서도 프로젝트 등록 가능**: "전체 보기" 탭에서도 "새 프로젝트" 버튼이 보이며, 등록 시 대분류를 직접 선택합니다.
8. **담당자 표시**: 업무 카드에 외주 작업자 이름 옆으로 담당자 이름이 함께 표시됩니다. (업무마다 담당자를 지정할 수 있습니다)
9. **전체 업무 검색**: "전체 업무" 화면에서 작업자/담당자 이름으로 검색해 담당 업무를 바로 확인할 수 있습니다.

## 기능 요약

- **로그인**: Supabase Auth. 최초 담당자만 SQL로 생성, 이후 담당자·외주 작업자는 앱 안에서 서로 등록 (임시 비밀번호 발급 → 첫 로그인 시 본인 비밀번호로 변경 강제).
- **대분류**: 탭에서 추가·수정·삭제, "전체 보기"로 한 번에 열람.
- **프로젝트**: 등록/수정/삭제(비활성화)·복원·완전삭제, D-day, 4가지 상태 + 변경 로그, 에피소드 관리.
- **업무**: 등록(에피소드·카테고리·외주작업자·담당자·시작일·메모)/수정/삭제·복원·완전삭제.
- **업무 진행 흐름**: 시작 → 종료(파일 링크 필수) → 담당자 검수확인/재작업요청 → (재작업 시) 메시지 확인완료 → 수정완료(파일 링크) → 다시 검수.
- **게시 처리**: 모든 업무 완료(비활성화 업무 제외) + 검수상태 Complete(Kor)일 때만 게시 확인/불가 노출.
- **프로젝트 현황**: 확장 가능한 테이블 + 엑셀 다운로드, 외주 작업자 관리, 담당자 관리.
- **이메일 알림** (Resend): 업무 등록(즉시 또는 예약일 00시)/시작/종료/검수통과/재작업요청/작업자 재배정/게시확인·보류.

## 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 프로젝트 생성 (신규 설치라면)
2. SQL Editor에서 `supabase/schema.sql` 전체 실행
3. **이미 이전 버전을 운영 중이셨다면** `schema.sql` 맨 아래 "마이그레이션" 섹션의 주석 처리된 SQL을 실행하세요:

```sql
alter table tasks alter column subheading_id drop not null;
alter table profiles add column if not exists must_change_password boolean not null default false;
alter table subheadings rename to episodes;
alter table tasks rename column subheading_id to episode_id;
alter table tasks add column if not exists manager_id uuid references profiles(id);
alter table tasks add column if not exists planned_start_date date not null default current_date;
alter table tasks add column if not exists start_notice_sent boolean not null default false;
alter table tasks add column if not exists memo text default '';
alter table tasks add column if not exists file_link text default '';
```

**v1.02로 업그레이드하신다면** 아래도 추가로 실행해주세요 (시:분 기록 + 평점):

```sql
alter table tasks alter column start_date type timestamptz using start_date::timestamptz;
alter table tasks alter column completed_date type timestamptz using completed_date::timestamptz;
alter table tasks add column if not exists rating int check (rating between 1 and 5);
```

4. **첫 담당자 계정**만 아래처럼 SQL로 직접 만들어주세요 (이후 담당자는 앱 안의 "담당자 관리" 화면에서 서로 추가할 수 있습니다).

```sql
insert into profiles (id, email, name, role)
select id, email, '담당자 이름', 'manager'
from auth.users
where email = 'manager@example.com';
```

   위 계정으로 로그인하기 전에 Supabase Authentication 탭에서 해당 이메일로 사용자를 먼저 만들어두세요 (비밀번호를 직접 지정하고 "Auto Confirm User" 체크).

## 2. Resend 설정

1. [resend.com](https://resend.com) 가입, 발신 도메인 인증
2. API 키 발급 → `RESEND_API_KEY`
3. 인증된 발신 주소 → `EMAIL_FROM`

## 3. 환경 변수

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Settings > API
- `SUPABASE_SERVICE_ROLE_KEY` — 같은 위치의 service_role 키 (서버 전용)
- `RESEND_API_KEY` / `EMAIL_FROM`
- `NEXT_PUBLIC_APP_URL` — 배포 후 실제 도메인
- `CRON_SECRET` — 예약 발송 크론 작업 보호용 임의의 긴 문자열을 직접 정해서 넣으세요

## 4. 예약 발송 크론 설정 (Vercel Cron)

v1.03부터는 업무 등록 시 날짜뿐 아니라 시:분까지 지정할 수 있어서, `vercel.json`의 크론이 **10분마다** `/api/cron/send-task-notices`를 호출하도록 설정되어 있습니다 (지정한 시각이 되면 그 다음 10분 내로 메일이 발송됩니다).
**배포 전에 `vercel.json` 파일을 열어서 `CRON_SECRET_PLACEHOLDER` 부분을 `.env.local`에 넣은 `CRON_SECRET` 값과 동일하게 바꿔주세요.**

⚠️ **Vercel Hobby(무료) 플랜은 크론 작업을 하루 1회로 제한합니다.** 10분 간격 크론을 쓰려면 Vercel Pro 플랜이 필요합니다. Hobby 플랜을 쓰고 계시다면 두 가지 방법이 있어요:
- Vercel을 Pro로 업그레이드하거나
- [cron-job.org](https://cron-job.org) 같은 무료 외부 크론 서비스에서 `https://your-domain.com/api/cron/send-task-notices?secret=여러분의CRON_SECRET` 주소를 10분 간격으로 호출하도록 등록 (Vercel의 `vercel.json` crons 설정은 이 경우 무시하고 지워도 됩니다)

## 5. 로컬 실행

```bash
npm install
npm run dev
```

## 6. GitHub + Vercel 배포

```bash
git init
git add .
git commit -m "TaskFlow v1.01"
git remote add origin https://github.com/<your-account>/<repo-name>.git
git push -u origin main
```

Vercel에서 저장소를 import하고, 위 환경 변수(CRON_SECRET 포함)를 Vercel 프로젝트 Settings > Environment Variables에 동일하게 등록하면 배포가 완료됩니다.

## 폴더 구조

```
app/
  login/page.tsx
  board/page.tsx           메인 화면
  contractors/page.tsx      외주 작업자 관리
  managers/page.tsx         담당자 관리
  api/
    major-categories/       대분류 CRUD
    categories/              업무 카테고리 CRUD
    projects/                등록/수정/삭제·복원·완전삭제/상태변경/게시처리/에피소드
    episodes/[id]/           에피소드 수정/삭제
    contractors/, managers/  계정 등록/수정/삭제/비밀번호초기화
    tasks/                   등록/수정/삭제·복원·완전삭제/시작/종료/검수/재작업/확인
    cron/send-task-notices/  예약된 업무 등록 알림 발송 (Vercel Cron)
lib/
  supabase/                Supabase 클라이언트
  resend.ts                이메일 발송 래퍼
  email-templates.ts       알림 메일 템플릿
  types.ts                 공용 타입 + 상태 계산 함수
supabase/schema.sql          테이블, RLS 정책, 기본 데이터, 마이그레이션 안내
vercel.json                  Cron 설정
```

## v1.06 (내부/외주 토글, 순서 제한 없음, 담당자 강제완료, 에피소드×카테고리 현황)

- 업무 등록/수정(대기중) 시 "외주/내부" 토글 → 내부 선택 시 담당자 목록에서 진행자를 고를 수 있습니다.
- 업무 등록 시 "순서 제한 없음" 체크박스 → 켜면 이 업무는 카테고리 순서 계산에서 완전히 제외됩니다 (막지도, 막히지도 않음 - 보이스 등).
- 완료 전 업무 카드에 "담당자 완료 처리" 버튼 → 사유 입력 후 강제 완료 (시작/종료 시각·평점은 기록 안 함).
- 프로젝트 화면의 에피소드 탭 아래에 에피소드×카테고리 진행 현황 표 추가 (외주 작업자에게도 노출).

마이그레이션: `alter table tasks add column if not exists no_order_constraint boolean not null default false;`

## v1.07 (일정 관리 화면 재설계, 업무 순서 강제 해제)

- 일정 관리 화면을 주 단위(월~일) 날짜 스크롤 + 작업자 목록 형태로 전면 교체. 접으면 이름/이번 주 진행·완료 건수/AI 서비스 계정 버튼만, 펼치면 요일별로 진행 중·완료된 업무가 보입니다. 업무를 클릭하면 해당 프로젝트/에피소드로 바로 이동합니다.
- "이전 업무가 완료되지 않아도 업무 시작 가능"하도록 변경 (카테고리 순서에 따른 시작 버튼 비활성화 제거). 이전 업무 완료 시 발송되던 알림 메일은 그대로 유지됩니다.

## v1.08 (한국어/영어/베트남어 UI 토글)

- 헤더 우측에 한/EN/VI 언어 토글 추가 (localStorage에 저장되어 다음 방문에도 유지됩니다).
- 메뉴, 사이드바, 주요 버튼, 업무/프로젝트 상태 라벨 등 **앱 이용에 필요한 고정 UI 문구만** 번역됩니다.
- 사용자가 직접 입력하는 내용(이름, 프로젝트명, 업무명, 메모, 재작업 메시지 등)은 번역하지 않습니다 — 해외 작업자와의 실제 커뮤니케이션은 영어로 그대로 진행하시면 됩니다.
- 번역 범위: 상단 내비게이션, 사이드바(프로젝트 목록/전체 업무/프로젝트 현황/일정 관리), 업무 카드의 상태·액션 버튼, 프로젝트 상태 배지, 외주 작업자/담당자 관리 화면 제목 및 등록 버튼.
- 아직 번역이 안 된 세부 모달/입력 라벨이 보이면 알려주시면 추가로 반영해드릴게요 (lib/i18n.ts에 키만 추가하면 되는 구조라 확장이 쉽습니다).

## v1.09 (외주 작업자 상호 진행상황 공개)

- 외주 작업자도 매니저처럼 프로젝트의 작업 상황(에피소드×카테고리 표), 다른 작업자들의 업무를 볼 수 있습니다.
- 업무 보드에 "내 업무 보기 / 모든 업무 보기" 토글 추가 (외주 작업자 전용).
- 일정 관리 화면을 외주 작업자에게도 개방 (단, AI 서비스 계정 조회는 담당자만 가능하도록 유지). 업무 클릭 시 뜨는 모달은 본인 업무가 아니면 액션 버튼 없이 읽기 전용으로 보입니다.

### ⚠️ 필수 DB 마이그레이션 (이거 안 하면 화면에 아무것도 안 뜹니다)

```sql
drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select using (auth.role() = 'authenticated');

drop policy if exists "task_assignments_select" on task_assignments;
create policy "task_assignments_select" on task_assignments for select using (auth.role() = 'authenticated');
```
