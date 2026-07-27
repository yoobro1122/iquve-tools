import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

async function requireManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const db = createServiceRoleClient();
  if (!user) return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }), db: null as ReturnType<typeof createServiceRoleClient> | null, userId: null as string | null };
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return { error: NextResponse.json({ error: "권한이 없습니다." }, { status: 403 }), db: null as ReturnType<typeof createServiceRoleClient> | null, userId: null as string | null };
  return { error: null as NextResponse | null, db, userId: user.id };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const r = await requireManager();
  if (r.error) return r.error;
  const { name, note } = await req.json();
  const { data, error } = await r.db!.from("profiles")
    .update({ name, note })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireManager();
  if (r.error) return r.error;

  if (params.id === r.userId) {
    return NextResponse.json({ error: "본인 계정은 삭제할 수 없습니다." }, { status: 400 });
  }
  const { count } = await r.db!.from("profiles").select("id", { count: "exact", head: true }).eq("role", "manager");
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "마지막 남은 담당자 계정은 삭제할 수 없습니다." }, { status: 400 });
  }

  const { error: delProfileErr } = await r.db!.from("profiles").delete().eq("id", params.id);
  if (delProfileErr) return NextResponse.json({ error: delProfileErr.message }, { status: 500 });
  await r.db!.auth.admin.deleteUser(params.id);
  return NextResponse.json({ ok: true });
}
