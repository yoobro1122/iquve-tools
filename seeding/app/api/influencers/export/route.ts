import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import * as XLSX from "xlsx";

// xlsx 라이브러리가 Buffer를 사용하므로 Node 런타임 고정
export const runtime = "nodejs";

const PLATFORM_LABEL: Record<string, string> = {
  youtube: "유튜브",
  instagram: "인스타그램",
  naver_blog: "네이버 블로그",
};

// GET /api/influencers/export?platform=instagram&status=연락전&minFollowers=10000&category=육아
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const status = searchParams.get("status");
  const minFollowers = searchParams.get("minFollowers");
  const category = searchParams.get("category");

  const supabase = getSupabaseServer();
  let query = supabase
    .from("influencers")
    .select("*")
    .order("followers_count", { ascending: false });

  if (platform) query = query.eq("platform", platform);
  if (status) query = query.eq("partnership_status", status);
  if (minFollowers) query = query.gte("followers_count", Number(minFollowers));
  if (category) query = query.contains("category_tags", [category]);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((r: any) => ({
    플랫폼: PLATFORM_LABEL[r.platform] ?? r.platform,
    계정: r.handle,
    표시이름: r.display_name ?? "",
    "팔로워/구독자수": r.followers_count ?? "",
    카테고리: (r.category_tags ?? []).join(", "),
    컨택포인트: r.contact_dm ?? "",
    진행상태: r.partnership_status,
    메모: r.memo ?? "",
    참고링크: r.source_permalink ?? "",
    등록일: r.created_at ? new Date(r.created_at).toLocaleDateString("ko-KR") : "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  // 열 너비 대략 지정 (가독성)
  worksheet["!cols"] = [
    { wch: 10 }, // 플랫폼
    { wch: 20 }, // 계정
    { wch: 16 }, // 표시이름
    { wch: 14 }, // 팔로워/구독자수
    { wch: 16 }, // 카테고리
    { wch: 24 }, // 컨택포인트
    { wch: 10 }, // 진행상태
    { wch: 24 }, // 메모
    { wch: 30 }, // 참고링크
    { wch: 12 }, // 등록일
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "인플루언서");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = `influencers_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
