// HikerAPI 헬퍼 (서드파티 인스타그램 데이터 API)
// https://hikerapi.com — Meta 공식 App Review 없이 공개 프로필 데이터 조회 가능
// API 키는 앱 "설정" 탭에서 입력 -> Supabase seeding_api_config 테이블에 저장된 값을 사용합니다.

import { requireConfig } from "./apiConfig";

const HIKER_BASE = "https://api.hikerapi.com";

export interface HikerProfile {
  username: string;
  name: string | null;
  biography: string | null;
  followersCount: number;
  mediaCount: number;
  isVerified: boolean;
  publicEmail: string | null; // 비즈니스 계정인 경우 공개 이메일이 내려오기도 함
  publicPhoneNumber: string | null;
  lastPostAt: string | null; // 최근 게시물 작성일 (ISO 문자열)
}

// 최근 게시물 1개의 작성일을 조회. 응답 필드가 taken_at(초 단위 유닉스타임)일 것으로
// 가정하고 방어적으로 파싱합니다.
async function getLatestPostDate(userId: string, accessKey: string): Promise<string | null> {
  try {
    const url = `${HIKER_BASE}/v1/user/medias?user_id=${encodeURIComponent(userId)}&amount=1`;
    const res = await fetch(url, {
      headers: { "x-access-key": accessKey, accept: "application/json" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const items: any[] = Array.isArray(data) ? data : data.items ?? data.medias ?? [];
    const first = items[0];
    if (!first) return null;

    const rawTakenAt = first.taken_at ?? first.taken_at_ts ?? first.device_timestamp;
    if (!rawTakenAt) return null;

    // 초 단위 유닉스타임으로 가정 (Instagram 관례). 이미 ms 단위면 자동으로 큰 값이 나옴.
    const ms = Number(rawTakenAt) < 10_000_000_000 ? Number(rawTakenAt) * 1000 : Number(rawTakenAt);
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

export interface HikerProfileError {
  username: string;
  reason: string;
}

export interface FetchHikerProfilesResult {
  results: HikerProfile[];
  errors: HikerProfileError[];
  filteredByMinFollowers: string[];
  filteredByMaxFollowers: string[];
}

export interface InstagramSearchCandidate {
  username: string;
  fullName: string | null;
  isVerified: boolean;
  followerCount: number | null; // 검색 결과 자체에는 없을 수 있음 (프로필 조회로 보강 필요)
  profilePicUrl: string | null;
}

// 인스타그램 응답(특히 해시태그/탐색 피드)은 sections -> layout_content -> ... 식으로
// 깊고 다양하게 중첩되어 있어서 고정된 경로로 파싱하기 어렵습니다.
// 그래서 JSON 전체를 재귀적으로 훑어서 "username" 문자열 필드를 가진 객체를
// 전부 찾아내는 방식으로 처리합니다 (구조가 어떻게 바뀌어도 안전).
function extractUsersRecursively(
  node: any,
  out: Map<string, InstagramSearchCandidate>,
  depth = 0
) {
  if (node == null || depth > 15) return;

  if (Array.isArray(node)) {
    for (const item of node) extractUsersRecursively(item, out, depth + 1);
    return;
  }

  if (typeof node !== "object") return;

  if (
    typeof node.username === "string" &&
    node.username.length > 0 &&
    !out.has(node.username)
  ) {
    out.set(node.username, {
      username: node.username,
      fullName: node.full_name ?? null,
      isVerified: Boolean(node.is_verified),
      followerCount: node.follower_count != null ? Number(node.follower_count) : null,
      profilePicUrl: node.profile_pic_url ?? null,
    });
  }

  for (const key of Object.keys(node)) {
    extractUsersRecursively(node[key], out, depth + 1);
  }
}

// 키워드로 계정 검색.
export async function searchInstagramAccounts(
  query: string
): Promise<InstagramSearchCandidate[]> {
  const accessKey = await requireConfig("hikerapi_access_key");
  const url = `${HIKER_BASE}/v2/search/accounts?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "x-access-key": accessKey, accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`계정 검색 실패: ${res.status} ${body}`);
  }

  const data = await res.json();
  const found = new Map<string, InstagramSearchCandidate>();
  extractUsersRecursively(data, found);

  if (found.size === 0) {
    throw new Error(
      `계정 검색 결과에서 username을 인식하지 못했습니다. 원본 응답 일부: ${JSON.stringify(
        data
      ).slice(0, 500)}`
    );
  }

  return Array.from(found.values());
}

// 해시태그로 게시물을 찾고, 게시자 username을 추출합니다.
// Meta 공식 API와 달리 게시자 정보를 가리지 않아서 실제 username을 얻을 수 있습니다.
// 응답이 sections -> layout_content -> ... 식으로 깊게 중첩되어 있어서
// 고정 경로 대신 재귀 탐색으로 username을 찾습니다.
export async function searchInstagramByHashtag(
  hashtag: string,
  mediaType: "top" | "recent" = "top"
): Promise<InstagramSearchCandidate[]> {
  const accessKey = await requireConfig("hikerapi_access_key");
  const cleanTag = hashtag.replace(/^#/, "");
  const url = `${HIKER_BASE}/v2/hashtag/medias/${mediaType}?name=${encodeURIComponent(cleanTag)}`;
  const res = await fetch(url, {
    headers: { "x-access-key": accessKey, accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`해시태그 검색 실패: ${res.status} ${body}`);
  }

  const data = await res.json();
  const found = new Map<string, InstagramSearchCandidate>();
  extractUsersRecursively(data, found);

  if (found.size === 0) {
    throw new Error(
      `해시태그 검색 결과에서 username을 인식하지 못했습니다. 원본 응답 일부: ${JSON.stringify(
        data
      ).slice(0, 500)}`
    );
  }

  return Array.from(found.values());
}

// username 목록을 순차 조회 (레이트리밋 보호용 딜레이 포함)
export async function fetchHikerProfiles(
  usernames: string[],
  opts: { minFollowers?: number; maxFollowers?: number } = {}
): Promise<FetchHikerProfilesResult> {
  const accessKey = await requireConfig("hikerapi_access_key");
  const minFollowers = opts.minFollowers ?? 0;
  const maxFollowers = opts.maxFollowers ?? Infinity;

  const results: HikerProfile[] = [];
  const errors: HikerProfileError[] = [];
  const filteredByMinFollowers: string[] = [];
  const filteredByMaxFollowers: string[] = [];

  for (const username of usernames) {
    try {
      const url = `${HIKER_BASE}/v1/user/by/username?username=${encodeURIComponent(username)}`;
      const res = await fetch(url, {
        headers: { "x-access-key": accessKey, accept: "application/json" },
      });

      if (!res.ok) {
        const body = await res.text();
        let reason = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body);
          reason = parsed.detail ?? parsed.message ?? reason;
        } catch {
          reason = body || reason;
        }
        errors.push({ username, reason });
        continue;
      }

      const data = await res.json();
      const followersCount = Number(data.follower_count ?? 0);

      if (followersCount < minFollowers) {
        filteredByMinFollowers.push(username);
        continue;
      }
      if (followersCount > maxFollowers) {
        filteredByMaxFollowers.push(username);
        continue;
      }

      const userId = data.pk ? String(data.pk) : null;
      const lastPostAt = userId ? await getLatestPostDate(userId, accessKey) : null;

      results.push({
        username: data.username ?? username,
        name: data.full_name ?? null,
        biography: data.biography ?? null,
        followersCount,
        mediaCount: Number(data.media_count ?? 0),
        isVerified: Boolean(data.is_verified),
        publicEmail: data.public_email ?? null,
        publicPhoneNumber: data.public_phone_number ?? null,
        lastPostAt,
      });

      // 호출 간 약간의 딜레이 (레이트리밋 보호)
      await new Promise((r) => setTimeout(r, 200));
    } catch (err: any) {
      errors.push({ username, reason: err?.message ?? "알 수 없는 에러" });
    }
  }

  return { results, errors, filteredByMinFollowers, filteredByMaxFollowers };
}
