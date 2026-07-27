import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { reworkRequestedEmail } from "@/lib/email-templates";

// 담당자가 이미 전달된 재작업 메시지를 추가/수정 (기존 메시지 아래에 새 메시지가 쌓임).
// 작업자의 "메시지 확인 완료" 여부를 다시 false로 초기화합니다.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "메시지를 입력해주세요." }, { status: 400 });

  const { data: task } = await db.from("tasks").select("*, project:project_id(name), episode:episode_id(label), contractor:contractor_id(email,name)").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  if (task.status !== "rework_notice") return NextResponse.json({ error: "재작업 대기 상태가 아닙니다." }, { status: 400 });

  await db.from("tasks").update({ rework_acknowledged: false }).eq("id", params.id);
  await db.from("task_rework_notes").insert({ task_id: params.id, message: message.trim() });

  const { subject, html } = reworkRequestedEmail(task.project.name, task.episode?.label ?? "적용 안함", message.trim());
  await sendMail(task.contractor.email, subject, html);

  await db.from("project_logs").insert({ project_id: task.project_id, actor_id: user.id, actor_name: profile.name, change: `업무 ${task.code} 재작업 메시지 수정 - ${message.trim()}` });

  return NextResponse.json({ ok: true });
}
