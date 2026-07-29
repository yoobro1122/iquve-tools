import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// 로그인한 사용자가 매니저이거나 본인(id)일 때만 조회/등록 가능
async function checkAccess(db: ReturnType<typeof createServiceRoleClient>, userId: string, targetId: string) {
  if (userId === targetId) return true;
  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).single();
  return profile?.role === "manager";
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  if (!(await checkAccess(db, user.id, params.id))) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data, error } = await db.from("contractor_ai_accounts").select("*, ai_service:ai_service_id(*)").eq("contractor_id", params.id).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { ai_service_id, account_label, remaining_credit } = await req.json();
  if (!ai_service_id) return NextResponse.json({ error: "AI 서비스를 선택해주세요." }, { status: 400 });

  const { data, error } = await db.from("contractor_ai_accounts").insert({
    contractor_id: params.id, ai_service_id, account_label: account_label ?? "", remaining_credit: remaining_credit ?? 0,
  }).select("*, ai_service:ai_service_id(*)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
