# iQUVE Tools

iQUVE 내부 업무 도구 모음입니다.

## 구조

```
index.html          # 툴 목록 홈
ad-maker.html       # 광고 소재 자동 생성
settings.html       # API 키 관리 (비밀번호 보호)
vercel.json         # Vercel 배포 설정
supabase/
  functions/
    gemini-proxy/   # Gemini API 프록시 (Edge Function)
```

## 배포

### 1. Supabase Edge Function 배포
Supabase 대시보드 → Edge Functions → `gemini-proxy` 함수 생성 후 `supabase/functions/gemini-proxy/index.ts` 코드 붙여넣기

### 2. GitHub → Vercel 배포
1. 이 레포를 GitHub에 push
2. vercel.com → New Project → GitHub 레포 선택
3. 자동 배포 완료

### 3. API 키 설정
배포된 URL/settings 접속 → 비밀번호 `iquve` → Figma 토큰 + Gemini 키 입력 후 저장

## 기술 스택
- Frontend: Vanilla HTML/CSS/JS (Vercel 정적 호스팅)
- Backend: Supabase (PostgreSQL DB + Edge Functions)
- AI: Google Gemini 2.0 Flash (문구) + Imagen 3 (이미지)
- 디자인 연동: Figma API
