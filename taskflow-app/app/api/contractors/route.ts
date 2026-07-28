import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { data, error } = await db.from("profiles").select("*").eq("role", "contractor").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 완료된 업무 기준으로 작업자별 통계(총 건수/평균 작업시간/평균 평점) 계산
  const { data: doneTasks } = await db
    .from("tasks")
    .select("contractor_id, start_date, completed_date, rating")
    .eq("status", "done");

  const statsByContractor: Record<string, { total: number; durations: number[]; ratings: number[] }> = {};
  for (const t of doneTasks ?? []) {
    const s = (statsByContractor[t.contractor_id] ??= { total: 0, durations: [], ratings: [] });
    s.total += 1;
    if (t.start_date && t.completed_date) {
      const minutes = (new Date(t.completed_date).getTime() - new Date(t.start_date).getTime()) / 60000;
      if (minutes >= 0) s.durations.push(minutes);
    }
    if (typeof t.rating === "number") s.ratings.push(t.rating);
  }

  const items = (data ?? []).map((c) => {
    const s = statsByContractor[c.id];
    const avgDurationMinutes = s && s.durations.length > 0 ? s.durations.reduce((a, b) => a + b, 0) / s.durations.length : null;
    const avgRating = s && s.ratings.length > 0 ? s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length : null;
    return { ...c, stats: { totalDone: s?.total ?? 0, avgDurationMinutes, avgRating } };
  });

  return NextResponse.json({ items });
}

// 새 외주 작업자 등록: Supabase Auth 계정을 생성하고 profiles에 role='contractor'로 저장.
// 임시 비밀번호를 발급하고 응답에 포함해 담당자가 직접 전달할 수 있게 합니다.
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { name, email, specialty, note } = await req.json();
  if (!name?.trim() || !email?.trim()) return NextResponse.json({ error: "이름과 이메일은 필수입니다." }, { status: 400 });

  const tempPassword = Math.random().toString(36).slice(2, 10);
  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email: email.trim(),
    password: tempPassword,
    email_confirm: true,
  });
  if (authErr || !created.user) return NextResponse.json({ error: authErr?.message ?? "계정 생성 실패" }, { status: 500 });

  const { data: newProfile, error: profileErr } = await db.from("profiles").insert({
    id: created.user.id, email: email.trim(), name: name.trim(), role: "contractor",
    specialty: specialty ?? "", note: note ?? "", must_change_password: true,
  }).select().single();
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  return NextResponse.json({ item: newProfile, tempPassword });
}
