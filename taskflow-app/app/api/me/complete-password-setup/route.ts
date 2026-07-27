import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// 로그인한 사용자가 (임시 비밀번호를 자신의 비밀번호로 바꾼 뒤) must_change_password 플래그를 해제.
// 비밀번호 자체는 클라이언트에서 supabase.auth.updateUser()로 이미 변경된 상태여야 합니다.
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const db = createServiceRoleClient();
  const { error } = await db.from("profiles").update({ must_change_password: false }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
