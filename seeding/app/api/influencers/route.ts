import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

// GET /api/influencers?platform=instagram&status=연락전&minFollowers=10000&category=육아
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const status = searchParams.get("status");
  const minFollowers = searchParams.get("minFollowers");
  const category = searchParams.get("category");

  const supabase = getSupabaseServer();
  let query = supabase.from("influencers").select("*").order("followers_count", { ascending: false });

  if (platform) query = query.eq("platform", platform);
  if (status) query = query.eq("partnership_status", status);
  if (minFollowers) query = query.gte("followers_count", Number(minFollowers));
  if (category) query = query.contains("category_tags", [category]);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data });
}

// 메모/소개글 텍스트에서 이메일 형식을 찾아 첫 번째 매치를 반환
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function extractEmail(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(EMAIL_REGEX);
  return match ? match[0] : null;
}

// POST /api/influencers  - 단건 또는 배열로 등록 가능
export async function POST(req: NextRequest) {
  const body = await req.json();
  const rows = (Array.isArray(body) ? body : [body]).map((row: any) => {
    // 컨택포인트가 비어있고, 메모(소개글)에 이메일이 보이면 자동으로 채워줌
    if (!row.contact_dm) {
      const foundEmail = extractEmail(row.memo);
      if (foundEmail) {
        return { ...row, contact_dm: foundEmail };
      }
    }
    return row;
  });

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from("influencers").insert(rows).select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data }, { status: 201 });
}
