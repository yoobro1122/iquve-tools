import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// 특정 외주 작업자의 모든 업무(대기/진행/완료 등, 비활성화 제외)를 조회합니다.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data, error } = await db
    .from("tasks")
    .select("*, project:project_id(code,name), episode:episode_id(label), category:category_id(label), manager:manager_id(name)")
    .eq("contractor_id", params.id)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data });
}
