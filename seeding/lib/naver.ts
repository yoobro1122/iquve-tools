// 네이버 검색 오픈API 헬퍼 (블로그 검색)
// Client ID/Secret은 앱 "설정" 탭에서 입력 -> Supabase api_config 테이블에 저장된 값을 사용합니다.
//
// 참고: 이웃수/방문자수 등 프로필 통계는 공식 API에 없음.
// 블로그 프로필 페이지 스크래핑은 이용약관상 지원하지 않으므로,
// 필요 시 bloggerlink를 열어 직접 확인해야 함.

import { requireConfig } from "./apiConfig";

const NAVER_BASE = "https://openapi.naver.com/v1/search/blog.json";

export interface NaverBlogResult {
  title: string;       // HTML 태그(<b> 등) 포함될 수 있음
  link: string;        // 포스트 링크
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;    // YYYYMMDD 형식
}

function stripTags(s: string) {
  return s.replace(/<\/?b>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

// 키워드로 블로그 포스트 검색. sort=sim(정확도순) - 실제 네이버 검색 노출순위와
// 완전히 동일하지는 않지만, date(최신순)보다 실제 검색결과 상단 노출과 더 가까운 편입니다.
// 참고: 진짜 검색 노출순위(C-Rank 등)는 비공개 알고리즘이라 API로는 확인 불가합니다.
export async function searchNaverBlogs(
  query: string,
  display = 30
): Promise<NaverBlogResult[]> {
  const clientId = await requireConfig("naver_client_id", "NAVER_CLIENT_ID");
  const clientSecret = await requireConfig("naver_client_secret", "NAVER_CLIENT_SECRET");

  const url = `${NAVER_BASE}?query=${encodeURIComponent(
    query
  )}&display=${display}&sort=sim`;

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!res.ok) {
    throw new Error(`네이버 블로그 검색 실패: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return (data.items ?? []).map((item: any) => ({
    title: stripTags(item.title ?? ""),
    link: item.link,
    description: stripTags(item.description ?? ""),
    bloggername: item.bloggername ?? "",
    bloggerlink: item.bloggerlink ?? "",
    postdate: item.postdate ?? "",
  }));
}

// postdate(YYYYMMDD)가 최근 N일 이내인지 확인
export function isWithinDays(postdate: string, days: number): boolean {
  if (!postdate || postdate.length !== 8) return false;
  const year = Number(postdate.slice(0, 4));
  const month = Number(postdate.slice(4, 6)) - 1;
  const day = Number(postdate.slice(6, 8));
  const postTime = new Date(year, month, day).getTime();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return postTime >= cutoff;
}

// 같은 블로거의 여러 포스트가 검색될 수 있으므로 bloggerlink 기준으로 묶어서
// 최신 포스팅일 하나만 남김 (활동 여부 판단용)
export function dedupeByBlogger(results: NaverBlogResult[]): NaverBlogResult[] {
  const map = new Map<string, NaverBlogResult>();
  for (const r of results) {
    const existing = map.get(r.bloggerlink);
    if (!existing || r.postdate > existing.postdate) {
      map.set(r.bloggerlink, r);
    }
  }
  return Array.from(map.values());
}
