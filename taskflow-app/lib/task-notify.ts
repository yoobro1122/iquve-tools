import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/resend";

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
