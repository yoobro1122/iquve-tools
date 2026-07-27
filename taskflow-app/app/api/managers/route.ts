import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data, error } = await db.from("profiles").select("*").eq("role", "manager").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// 새 담당자(관리자) 계정 등록: Supabase Auth 계정 생성 + profiles(role='manager') 저장.
// 임시 비밀번호를 발급하며, must_change_password=true로 표시해 첫 로그인 시 비밀번호 변경을 강제합니다.
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { name, email, note } = await req.json();
  if (!name?.trim() || !email?.trim()) return NextResponse.json({ error: "이름과 이메일은 필수입니다." }, { status: 400 });

  const tempPassword = Math.random().toString(36).slice(2, 10);
  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email: email.trim(),
    password: tempPassword,
    email_confirm: true,
  });
  if (authErr || !created.user) return NextResponse.json({ error: authErr?.message ?? "계정 생성 실패" }, { status: 500 });

  const { data: newProfile, error: profileErr } = await db.from("profiles").insert({
    id: created.user.id, email: email.trim(), name: name.trim(), role: "manager",
    specialty: "", note: note ?? "", must_change_password: true,
  }).select().single();
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  return NextResponse.json({ item: newProfile, tempPassword });
}
