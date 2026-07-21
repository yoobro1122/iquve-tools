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

// POST /api/influencers  - 단건 또는 배열로 등록 가능
export async function POST(req: NextRequest) {
  const body = await req.json();
  const rows = Array.isArray(body) ? body : [body];

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from("influencers").insert(rows).select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data }, { status: 201 });
}
