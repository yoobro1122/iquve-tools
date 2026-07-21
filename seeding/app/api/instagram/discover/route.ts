import { NextRequest, NextResponse } from "next/server";
import { discoverBusinessAccounts } from "@/lib/instagram";
import { getSupabaseServer } from "@/lib/supabase";

// POST /api/instagram/discover
// body: { usernames: string[], minFollowers?: number, activeWithinDays?: number }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const usernames: string[] = body.usernames ?? [];
  const minFollowers: number = body.minFollowers ?? 0;
  const activeWithinDays: number = body.activeWithinDays ?? 7;

  if (!Array.isArray(usernames) || usernames.length === 0) {
    return NextResponse.json({ error: "usernames 배열이 필요합니다." }, { status: 400 });
  }

  try {
    const { results, errors, filteredByMinFollowers } = await discoverBusinessAccounts(
      usernames,
      { minFollowers, activeWithinDays }
    );

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
