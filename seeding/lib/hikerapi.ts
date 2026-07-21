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
}

export interface HikerProfileError {
  username: string;
  reason: string;
}

export interface FetchHikerProfilesResult {
  results: HikerProfile[];
  errors: HikerProfileError[];
  filteredByMinFollowers: string[];
}

// username 목록을 순차 조회 (레이트리밋 보호용 딜레이 포함)
export async function fetchHikerProfiles(
  usernames: string[],
  opts: { minFollowers?: number } = {}
): Promise<FetchHikerProfilesResult> {
  const accessKey = await requireConfig("hikerapi_access_key");
  const minFollowers = opts.minFollowers ?? 0;

  const results: HikerProfile[] = [];
  const errors: HikerProfileError[] = [];
  const filteredByMinFollowers: string[] = [];

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

      results.push({
        username: data.username ?? username,
        name: data.full_name ?? null,
        biography: data.biography ?? null,
        followersCount,
        mediaCount: Number(data.media_count ?? 0),
        isVerified: Boolean(data.is_verified),
        publicEmail: data.public_email ?? null,
        publicPhoneNumber: data.public_phone_number ?? null,
      });

      // 호출 간 약간의 딜레이 (레이트리밋 보호)
      await new Promise((r) => setTimeout(r, 200));
    } catch (err: any) {
      errors.push({ username, reason: err?.message ?? "알 수 없는 에러" });
    }
  }

  return { results, errors, filteredByMinFollowers };
}
