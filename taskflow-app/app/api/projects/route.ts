import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const db = createServiceRoleClient();
  const { searchParams } = new URL(req.url);
  const majorCategoryId = searchParams.get("major_category_id");

  let query = db.from("projects").select("*, episodes(*)").order("created_at", { ascending: false });
  if (majorCategoryId) query = query.eq("major_category_id", majorCategoryId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { code, name, major_category_id } = await req.json();
  if (!code?.trim() || !name?.trim() || !major_category_id)
    return NextResponse.json({ error: "프로젝트 넘버, 이름, 대분류는 필수입니다." }, { status: 400 });

  const { data: dupCode } = await db.from("projects").select("id").eq("major_category_id", major_category_id).eq("code", code.trim()).maybeSingle();
  if (dupCode) return NextResponse.json({ error: "이미 사용 중인 프로젝트 넘버입니다." }, { status: 409 });
  const { data: dupName } = await db.from("projects").select("id").eq("major_category_id", major_category_id).eq("name", name.trim()).maybeSingle();
  if (dupName) return NextResponse.json({ error: "이미 사용 중인 프로젝트명입니다." }, { status: 409 });

  const { data, error } = await db.from("projects").insert({
    code: code.trim(), name: name.trim(), major_category_id,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("project_logs").insert({
    project_id: data.id, actor_id: user.id, actor_name: profile.name, change: "프로젝트 등록",
  });

  return NextResponse.json({ item: data });
}
