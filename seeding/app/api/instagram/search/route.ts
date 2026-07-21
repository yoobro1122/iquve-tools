import { NextRequest, NextResponse } from "next/server";
import { searchInstagramAccounts, fetchHikerProfiles } from "@/lib/hikerapi";
import { getSupabaseServer } from "@/lib/supabase";

// GET /api/instagram/search?q=육아&minFollowers=5000
// 키워드로 계정을 찾은 뒤, 각 계정의 팔로워수·소개글·최근 게시물일까지 자동으로 채워서 반환합니다.
// (검색 API 자체는 팔로워수를 안 주는 경우가 많아서, 프로필 조회를 자동으로 한 번 더 합니다)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const minFollowers = Number(searchParams.get("minFollowers") ?? 0);

  if (!q) {
    return NextResponse.json({ error: "검색어(q)가 필요합니다." }, { status: 400 });
  }

  try {
    const candidates = await searchInstagramAccounts(q);
    const usernames = candidates.map((c) => c.username).slice(0, 20); // 비용 보호용 상한

    if (usernames.length === 0) {
      return NextResponse.json({
        results: [],
        errors: [],
        filteredByMinFollowers: [],
        alreadyInDb: [],
      });
    }

    const { results, errors, filteredByMinFollowers } = await fetchHikerProfiles(usernames, {
      minFollowers,
    });

    // 이미 DB에 등록된 계정은 결과에서 제외
    const supabase = getSupabaseServer();
    const { data: existing } = await supabase
      .from("influencers")
      .select("handle")
      .eq("platform", "instagram");
    const existingHandles = new Set((existing ?? []).map((r: any) => r.handle));
    const alreadyInDb = results
      .filter((r) => existingHandles.has(r.username))
      .map((r) => r.username);
    const filtered = results.filter((r) => !existingHandles.has(r.username));

    return NextResponse.json({
      results: filtered,
      errors,
      filteredByMinFollowers,
      alreadyInDb,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
