import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { taskSubmittedEmail } from "@/lib/email-templates";

// 업무 종료(최초) 또는 수정 완료(재작업 후 재제출) - 둘 다 status를 'reviewing'으로 전환.
// 파일 업로드 링크(file_link)를 필수로 받아 저장하고, 담당자가 검수 시 확인할 수 있게 합니다.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = createServiceRoleClient();

  const { file_link } = await req.json().catch(() => ({ file_link: "" }));
  if (!file_link?.trim()) return NextResponse.json({ error: "작업 파일 링크를 입력해주세요." }, { status: 400 });

  const { data: task } = await db.from("tasks").select("*, project:project_id(name), episode:episode_id(label), contractor:contractor_id(name), manager:manager_id(email)").eq("id", params.id).single();
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  if (task.contractor_id !== user.id) return NextResponse.json({ error: "본인 업무만 종료할 수 있습니다." }, { status: 403 });
  if (!["in_progress", "rework_notice"].includes(task.status))
    return NextResponse.json({ error: "종료할 수 없는 상태입니다." }, { status: 400 });
  if (task.status === "rework_notice" && !task.rework_acknowledged)
    return NextResponse.json({ error: "먼저 메시지 확인 완료를 눌러주세요." }, { status: 400 });

  const isResubmit = task.status === "rework_notice";
  const { error } = await db.from("tasks").update({ status: "reviewing", file_link: file_link.trim() }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipients: string[] = [];
  if (task.manager?.email) recipients.push(task.manager.email);
  else {
    const { data: managers } = await db.from("profiles").select("email").eq("role", "manager");
    recipients.push(...(managers ?? []).map((m) => m.email));
  }
  const { subject, html } = taskSubmittedEmail(task.project.name, task.episode?.label ?? "적용 안함", task.contractor.name, isResubmit, file_link.trim());
  for (const email of recipients) await sendMail(email, subject, html);

  await db.from("project_logs").insert({
    project_id: task.project_id, actor_id: user.id, actor_name: task.contractor.name,
    change: `업무 ${task.code} ${isResubmit ? "재제출" : "종료"} (검수 요청) - 파일: ${file_link.trim()}`,
  });

  return NextResponse.json({ ok: true });
}
