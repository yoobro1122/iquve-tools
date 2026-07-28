# TaskFlow — 미디어팀 외주 업무 관리 시스템 (v1.03)

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
