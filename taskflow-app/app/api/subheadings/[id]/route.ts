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
  const { label } = await req.json();
  const { data, error } = await r.db!.from("subheadings").update({ label }).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireManager();
  if (r.error) return r.error;
  const { error } = await r.db!.from("subheadings").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
