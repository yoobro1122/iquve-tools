import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";
import { taskUnlockedEmail, outOfOrderWarningEmail } from "@/lib/email-templates";

type Db = ReturnType<typeof createServiceRoleClient>;

// 메인 담당자 + 서브 담당자(참조) 전원의 이메일을 중복 없이 가져옵니다.
export async function getManagerStakeholderEmails(db: Db, taskId: string, mainManagerEmail?: string | null) {
  const emails = new Set<string>();
  if (mainManagerEmail) emails.add(mainManagerEmail);

  const { data: subs } = await db
    .from("task_sub_managers")
    .select("manager:manager_id(email)")
    .eq("task_id", taskId);
  for (const s of subs ?? []) {
    const email = (s as any).manager?.email;
    if (email) emails.add(email);
  }
  return Array.from(emails);
}

export async function notifyManagerStakeholders(
  db: Db,
  taskId: string,
  mainManagerEmail: string | null | undefined,
  subject: string,
  html: string
) {
  const emails = await getManagerStakeholderEmails(db, taskId, mainManagerEmail);
  for (const email of emails) await sendMail(email, subject, html);
}

// 방금 완료된 업무(justDoneTask) 기준으로, 같은 프로젝트+에피소드 안에서 순서상 다음 카테고리의
// 대기중 업무들을 확인해 이제 시작 가능해졌다면(모든 앞 순서 업무가 완료) 알림 메일을 보냅니다.
export async function notifyAiCreditAlertManagers(db: Db, subject: string, html: string) {
  const { data: optedIn } = await db.from("profiles").select("email").eq("role", "manager").eq("ai_credit_alert_opt_in", true);
  let recipients = (optedIn ?? []).map((m) => m.email);
  if (recipients.length === 0) {
    const { data: allManagers } = await db.from("profiles").select("email").eq("role", "manager");
    recipients = (allManagers ?? []).map((m) => m.email);
  }
  for (const email of recipients) await sendMail(email, subject, html);
}

export async function notifyOrderUnlock(db: Db, justDoneTask: { id: string; project_id: string; episode_id: string | null }) {
  if (!justDoneTask.episode_id) return;

  const { data: siblings } = await db
    .from("tasks")
    .select("*, project:project_id(name), episode:episode_id(label), contractor:contractor_id(email,name), category:category_id(sort_order)")
    .eq("project_id", justDoneTask.project_id)
    .eq("episode_id", justDoneTask.episode_id)
    .eq("archived", false)
    .eq("status", "waiting")
    .eq("order_unlock_notified", false)
    .eq("no_order_constraint", false);

  for (const candidate of siblings ?? []) {
    if (!candidate.category) continue;
    const { data: blockers } = await db
      .from("tasks")
      .select("status, category:category_id(sort_order)")
      .eq("project_id", justDoneTask.project_id)
      .eq("episode_id", justDoneTask.episode_id)
      .eq("archived", false)
      .eq("no_order_constraint", false)
      .neq("id", candidate.id);
    const earlier = (blockers ?? []).filter((b: any) => b.category && b.category.sort_order < (candidate.category as any).sort_order);
    const allEarlierDone = earlier.every((b: any) => b.status === "done");
    if (allEarlierDone && candidate.contractor) {
      const { subject, html } = taskUnlockedEmail(candidate.project.name, candidate.episode?.label ?? "적용 안함", candidate.contractor.name);
      await sendMail(candidate.contractor.email, subject, html);
      await db.from("tasks").update({ order_unlock_notified: true }).eq("id", candidate.id);
    }
  }
}

// 완료된(done) 업무를 재오픈(재작업/인계)할 때, 같은 에피소드의 다음 순서 업무가 이미
// 시작/진행되어 있다면 자동으로 멈추지 않고 로그 + 메일로만 경고합니다.
export async function checkAndWarnOutOfOrder(
  db: Db,
  task: { id: string; project_id: string; episode_id: string | null; code: string; manager_id: string | null },
  taskLabel: string,
  projectName: string
) {
  if (!task.episode_id) return;
  const { data: myTask } = await db.from("tasks").select("category:category_id(sort_order), no_order_constraint").eq("id", task.id).single();
  if (myTask?.no_order_constraint) return;
  const myOrder = (myTask?.category as any)?.sort_order;
  if (myOrder == null) return;

  const { data: laterTasks } = await db
    .from("tasks")
    .select("code, status, category:category_id(sort_order)")
    .eq("project_id", task.project_id)
    .eq("episode_id", task.episode_id)
    .eq("archived", false)
    .eq("no_order_constraint", false)
    .neq("id", task.id);

  const affected = (laterTasks ?? []).filter((t: any) => t.category && t.category.sort_order > myOrder && t.status !== "waiting");
  if (affected.length === 0) return;

  const affectedCodes = affected.map((t: any) => t.code).join(", ");
  await db.from("project_logs").insert({
    project_id: task.project_id, actor_id: null, actor_name: "시스템",
    change: `⚠️ 업무 ${task.code} 재작업으로 순서가 어긋났습니다 (이미 진행 중인 다음 순서 업무: ${affectedCodes})`,
  });

  const { data: manager } = task.manager_id ? await db.from("profiles").select("email").eq("id", task.manager_id).single() : { data: null };
  const { subject, html } = outOfOrderWarningEmail(projectName, taskLabel, affectedCodes);
  await notifyManagerStakeholders(db, task.id, manager?.email, subject, html);
}
