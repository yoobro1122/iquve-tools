import { NextRequest, NextResponse } from "next/server";
import { searchNaverBlogs, isWithinDays, dedupeByBlogger } from "@/lib/naver";
import { getSupabaseServer } from "@/lib/supabase";

// GET /api/naver/search?q=육아 그림책&withinDays=7&dedupe=true
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const withinDays = searchParams.get("withinDays");
  const dedupe = searchParams.get("dedupe") === "true";

  if (!q) {
    return NextResponse.json({ error: "검색어(q)가 필요합니다." }, { status: 400 });
  }

  try {
    const rawResults = await searchNaverBlogs(q);
    const totalRawCount = rawResults.length;

    let results = rawResults;
    let excludedByDate = 0;
    if (withinDays && Number(withinDays) > 0) {
      const before = results.length;
      results = results.filter((r) => isWithinDays(r.postdate, Number(withinDays)));
      excludedByDate = before - results.length;
    }

    let excludedByDedupe = 0;
    if (dedupe) {
      const before = results.length;
      results = dedupeByBlogger(results);
      excludedByDedupe = before - results.length;
    }

    // 이미 DB에 등록된 블로그는 결과에서 제외
    const supabase = getSupabaseServer();
    const { data: existing } = await supabase
      .from("influencers")
      .select("handle")
      .eq("platform", "naver_blog");
    const existingHandles = new Set((existing ?? []).map((r: any) => r.handle));
    const beforeDbFilter = results.length;
    results = results.filter((r) => !existingHandles.has(r.bloggerlink));
    const excludedByDb = beforeDbFilter - results.length;

    return NextResponse.json({
      results,
      totalRawCount,
      excludedByDate,
      excludedByDedupe,
      excludedByDb,
      notice:
        "이웃수/방문자수는 공식 API에 없습니다. bloggerlink를 열어 직접 확인 후 등록하세요.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
