# TaskFlow — iQUVE 외주 업무 관리 시스템

Next.js + Supabase + Resend로 만든 실제 서비스용 앱입니다. 프로토타입에서 확정한 화면/흐름을 그대로 구현했습니다.

## 기능 요약

- **로그인**: Supabase Auth (이메일/비밀번호). 담당자가 계정을 미리 생성합니다.
- **대분류**: 영어시리즈 제작 / 한글시리즈 제작 / 한글싱글북 (탭에서 추가·수정·삭제 가능, "전체 보기"로 한 번에 열람)
- **프로젝트**: 대분류별 등록, 넘버·이름 중복 검사, 수정, 삭제(비활성화)/복원, D-day 표시, 4가지 상태(프로젝트 상태/음량확인/업로드/검수상태), 상태 변경 로그
- **업무**: 카테고리·subheading·외주작업자 선택 등록, 수정, 삭제(비활성화)/복원
- **업무 진행 흐름**: 시작 → 종료(검수요청) → 담당자 검수확인/재작업요청 → (재작업 시) 메시지 확인완료 → 수정완료 → 다시 검수
- **게시 처리**: 모든 업무 완료 + 검수상태 Complete(Kor)일 때만 "게시 확인/불가" 노출, 불가 시 사유 입력
- **프로젝트 현황 테이블**, **외주 작업자 관리**(등록/수정/삭제/비밀번호 초기화), **담당자 관리**(같은 방식으로 다른 담당자 계정 등록/수정/삭제/비밀번호 초기화 — 본인 계정과 마지막 남은 담당자 계정은 삭제 불가)
- **첫 로그인 시 비밀번호 변경 강제**: 새로 등록되거나 비밀번호가 초기화된 계정은 로그인하면 본인 비밀번호로 바꿔야 화면을 사용할 수 있습니다.
- **이메일 알림** (Resend): 업무 시작/종료(담당자에게), 검수 통과/재작업 요청(작업자에게), 게시 확인/보류(작업자에게)

## 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 전체 실행 (대분류 3종 + 카테고리 5종 기본 데이터가 함께 들어갑니다)
3. **첫 담당자 계정**만 아래처럼 SQL로 직접 만들어주세요 (이후 담당자는 앱 안의 "담당자 관리" 화면에서 서로 추가할 수 있습니다).

```sql
insert into profiles (id, email, name, role)
select id, email, '담당자 이름', 'manager'
from auth.users
where email = 'manager@example.com';
```

   위 계정으로 로그인하기 전에 Supabase Authentication 탭에서 해당 이메일로 사용자를 먼저 만들어두세요 (비밀번호를 직접 지정하고 "Auto Confirm User" 체크). 이후 추가되는 담당자·외주 작업자 계정은 전부 앱 안의 "담당자 관리" / "외주 작업자 관리" 화면에서 자동으로 생성됩니다 (임시 비밀번호 발급 → 첫 로그인 시 본인 비밀번호로 변경).

## 2. Resend 설정

1. [resend.com](https://resend.com) 가입, 발신 도메인 인증
2. API 키 발급 → `RESEND_API_KEY`
3. 인증된 발신 주소 → `EMAIL_FROM`

## 3. 환경 변수

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Settings > API
- `SUPABASE_SERVICE_ROLE_KEY` — 같은 위치의 service_role 키 (서버 전용, 절대 클라이언트 노출 금지)
- `RESEND_API_KEY` / `EMAIL_FROM`
- `NEXT_PUBLIC_APP_URL` — 배포 후 실제 도메인

## 4. 로컬 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` → 로그인 → `/board`로 이동합니다.

## 5. GitHub + Vercel 배포

```bash
git init
git add .
git commit -m "init: TaskFlow"
git remote add origin https://github.com/<your-account>/<repo-name>.git
git push -u origin main
```

Vercel에서 저장소를 import하고, 위 환경 변수를 Vercel 프로젝트 Settings > Environment Variables에 동일하게 등록하면 배포가 완료됩니다.

## 폴더 구조

```
app/
  login/page.tsx          로그인
  board/page.tsx           메인 화면 (대분류 탭, 프로젝트 사이드바, 업무 보드, 각종 모달)
  contractors/page.tsx      외주 작업자 관리 (담당자 전용)
  api/
    major-categories/       대분류 CRUD
    categories/              업무 카테고리 CRUD
    projects/                프로젝트 등록/수정/삭제·복원/상태변경/게시처리/subheading
    subheadings/[id]/        subheading 수정/삭제
    contractors/             외주 작업자 등록/수정/삭제/비밀번호초기화
    tasks/                   업무 등록/수정/삭제·복원/시작/종료/검수/재작업/확인
lib/
  supabase/                Supabase 클라이언트 (브라우저용/서버용/서비스롤)
  resend.ts                이메일 발송 래퍼
  email-templates.ts       알림 메일 템플릿
  types.ts                 공용 타입 + 상태 계산 함수 (computeProjectStatus 등)
supabase/schema.sql          테이블, RLS 정책, 기본 데이터
```

## 참고

- 모든 상태 전이(시작/종료/검수/재작업/게시)와 등록/수정/삭제는 API 라우트에서 `service role` 키로 처리하며, 그 안에서 로그인한 사용자의 role/소유권을 확인합니다. 화면에서 바로 Supabase 테이블을 수정하지 않는 구조라 데이터 정합성이 보장됩니다.
- 삭제는 전부 소프트 삭제(`archived` 플래그)이며, 사이드바의 "삭제된 프로젝트" / 업무 목록 하단의 "삭제된 업무"에서 언제든 복원할 수 있습니다.
- 프로젝트 등록일(`created_at`)을 기준으로 D-day가 계산되며, 게시 확인 시점(`completed_at`)에 카운트가 멈춥니다.
