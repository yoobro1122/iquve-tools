import { NextRequest, NextResponse } from "next/server";
import { searchInstagramByHashtag, fetchHikerProfiles } from "@/lib/hikerapi";
import { getSupabaseServer } from "@/lib/supabase";

// GET /api/instagram/hashtag-search?tag=육아&minFollowers=5000&maxFollowers=50000&mediaType=top
// 해시태그로 게시물을 찾고, 게시자 계정들의 팔로워수·소개글·최근 게시물일까지 자동으로 채워서 반환합니다.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get("tag");
  const minFollowers = Number(searchParams.get("minFollowers") ?? 0);
  const maxFollowersRaw = searchParams.get("maxFollowers");
  const maxFollowers = maxFollowersRaw ? Number(maxFollowersRaw) : undefined;
  const mediaType = (searchParams.get("mediaType") as "top" | "recent") ?? "top";

  if (!tag) {
    return NextResponse.json({ error: "해시태그(tag)가 필요합니다." }, { status: 400 });
  }

  try {
    const candidates = await searchInstagramByHashtag(tag, mediaType);
    const usernames = candidates.map((c) => c.username).slice(0, 20); // 비용 보호용 상한

    if (usernames.length === 0) {
      return NextResponse.json({
        results: [],
        errors: [],
        filteredByMinFollowers: [],
        filteredByMaxFollowers: [],
        alreadyInDb: [],
      });
    }

    const { results, errors, filteredByMinFollowers, filteredByMaxFollowers } =
      await fetchHikerProfiles(usernames, { minFollowers, maxFollowers });

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
      filteredByMaxFollowers,
      alreadyInDb,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
