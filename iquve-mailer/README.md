# iQuve 메일 발송 도구

Next.js + Supabase + Resend 기반 이메일 캠페인 관리 도구

---

## 1. Supabase DB 설정 (최초 1회)

1. [Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 선택
2. 좌측 **SQL Editor** → **New query**
3. `supabase/migrations/001_init.sql` 파일 내용을 붙여넣고 실행

---

## 2. 로컬 개발

```bash
npm install
npm run dev
# http://localhost:3000 접속
```

`.env.local` 파일이 이미 설정되어 있습니다.

---

## 3. Vercel 배포

```bash
npm install -g vercel
vercel
```

Vercel 대시보드 → Settings → Environment Variables 에서 아래 항목 추가:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://emgsqnzfdvvbtooouaap.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbG...` |
| `RESEND_API_KEY` | `re_3ZiP...` |
| `FROM_EMAIL` | `iquve@growv.com` |
| `FROM_NAME` | `아이큐브` |

> ⚠️ **Resend 도메인 인증 필수**: `growv.com` 도메인이 Resend에서 인증되어야 `iquve@growv.com`으로 발송 가능합니다.  
> Resend Dashboard → Domains → Add Domain → DNS 레코드 등록

---

## 4. 사용 방법

### Step 1 · DB 업로드
- 엑셀 파일 업로드 (컬럼: 이메일, 전화번호, 결제여부, 마케팅 활용 수신 동의 여부)
- `@growv.com` / `@growv.kr` 자동 제외
- 중복 이메일은 최신 정보로 업데이트

### Step 2 · 메일 작성
- HTML 파일 업로드 또는 직접 편집기 입력
- 캠페인 이름(내부용), 메일 제목 입력

### Step 3 · 그룹 선택 + 미리보기
- 💳 결제회원 / 📋 이메일+전화번호 / ✉️ 이메일만 중 복수 선택 가능
- 실제 수신자 수 실시간 표시
- 미리보기 버튼으로 렌더링 확인

### Step 4 · 발송
- 최종 확인 후 발송
- 배치 50건씩 발송, 진행 상황 DB 업데이트
- 발송 로그 자동 저장

---

## 5. DB 스키마

| 테이블 | 설명 |
|--------|------|
| `members` | 회원 (email unique, category, paid, marketing) |
| `campaigns` | 발송 건 (subject, html_content, groups, status, count) |
| `send_logs` | 개별 발송 로그 (email, status, error_msg) |
