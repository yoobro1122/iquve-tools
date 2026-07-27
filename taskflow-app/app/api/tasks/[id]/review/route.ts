import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { reviewApprovedEmail, reworkRequestedEmail } from "@/lib/email-templates";

// body: { result: 'pass' | 'reject', note?: string }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role,name").eq("id", user.id).single();
  if (profile?.role !== "manager") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { result, note } = await req.json();
  if (!["pass", "reject"].includes(result)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { data: task } = await db.from("tasks").select("*, project:project_id(name), subheading:subheading_id(label), contractor:contractor_id(email,name)").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  if (task.status !== "reviewing") return NextResponse.json({ error: "현재 검수 대기 상태가 아닙니다." }, { status: 400 });

  if (result === "pass") {
    await db.from("tasks").update({ status: "done", completed_date: new Date().toISOString().slice(0, 10) }).eq("id", params.id);
    const { subject, html } = reviewApprovedEmail(task.project.name, task.subheading?.label ?? "적용 안함");
    await sendMail(task.contractor.email, subject, html);
    await db.from("project_logs").insert({ project_id: task.project_id, actor_id: user.id, actor_name: profile.name, change: `업무 ${task.code} 검수 확인 → 완료` });
  } else {
    await db.from("tasks").update({ status: "rework_notice", rework_acknowledged: false }).eq("id", params.id);
    await db.from("task_rework_notes").insert({ task_id: params.id, message: note ?? "" });
    const { subject, html } = reworkRequestedEmail(task.project.name, task.subheading?.label ?? "적용 안함", note ?? "");
    await sendMail(task.contractor.email, subject, html);
    await db.from("project_logs").insert({ project_id: task.project_id, actor_id: user.id, actor_name: profile.name, change: `업무 ${task.code} 재작업 요청 - ${note ?? ""}` });
  }

  return NextResponse.json({ ok: true });
}
