import { Resend } from "resend";

let client: Resend | null = null;
function getClient() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendMail(to: string, subject: string, html: string) {
  try {
    const result = await getClient().emails.send({
      from: process.env.EMAIL_FROM!,
      to,
      subject,
      html,
    });
    return { ok: true, result };
  } catch (error) {
    console.error("이메일 발송 실패:", error);
    return { ok: false, error };
  }
}
