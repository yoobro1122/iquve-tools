import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

async function requireManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return { error: NextResponse.json({ error: "권한이 없습니다." }, { status: 403 }) };
  return { db };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const r = await requireManager();
  if (r.error) return r.error;
  const { name, specialty, note } = await req.json();
  const { data, error } = await r.db!.from("profiles")
    .update({ name, specialty, note })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// 삭제는 소프트 삭제 없이 계정 자체를 비활성화하는 대신, 실무 편의상 완전 삭제로 처리합니다.
// (담당 업무가 남아있으면 FK 제약으로 실패하므로, 먼저 업무를 재배정/삭제해야 합니다.)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireManager();
  if (r.error) return r.error;
  const { error: delProfileErr } = await r.db!.from("profiles").delete().eq("id", params.id);
  if (delProfileErr) return NextResponse.json({ error: delProfileErr.message }, { status: 500 });
  await r.db!.auth.admin.deleteUser(params.id);
  return NextResponse.json({ ok: true });
}
