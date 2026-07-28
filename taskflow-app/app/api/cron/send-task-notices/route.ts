import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { taskAssignedEmail } from "@/lib/email-templates";

// Vercel Cron이 주기적으로 호출합니다 (vercel.json 참고). planned_start_date(발송 예정 일시)가
// 현재 시각 이하이고 아직 알림을 보내지 않은 업무들에 대해 "업무 등록" 메일을 발송합니다.
// 보안: 쿼리스트링의 secret이 CRON_SECRET과 일치할 때만 실행됩니다.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: dueTasks, error } = await db
    .from("tasks")
    .select("*, project:project_id(name), episode:episode_id(label), contractor:contractor_id(email,name)")
    .eq("archived", false)
    .eq("start_notice_sent", false)
    .lte("planned_start_date", nowIso);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const task of dueTasks ?? []) {
    if (!task.contractor) continue;
    const { subject, html } = taskAssignedEmail(task.project.name, task.episode?.label ?? "적용 안함", task.contractor.name, task.memo);
    await sendMail(task.contractor.email, subject, html);
    await db.from("tasks").update({ start_notice_sent: true }).eq("id", task.id);
    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
