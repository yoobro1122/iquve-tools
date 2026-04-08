import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`

const DAILY_LIMIT = 100
const BATCH_SIZE = 30
const BATCH_DELAY_MS = 2000
const MAIL_DELAY_MS = 100

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function sendEmails(
  emails: string[],
  subject: string,
  html: string,
  campaignId: string,
  db: ReturnType<typeof supabaseAdmin>
) {
  let sentCount = 0, failCount = 0
  const logs: { campaign_id: string; email: string; status: string; error_msg?: string }[] = []

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    for (const email of batch) {
      try {
        const result = await resend.emails.send({ from: FROM, to: email, subject, html })
        if (result.error) {
          failCount++
          logs.push({ campaign_id: campaignId, email, status: 'failed', error_msg: result.error.message })
        } else {
          sentCount++
          logs.push({ campaign_id: campaignId, email, status: 'sent' })
        }
      } catch (e) {
        failCount++
        logs.push({ campaign_id: campaignId, email, status: 'failed', error_msg: String(e) })
      }
      await sleep(MAIL_DELAY_MS)
    }
    await db.from('campaigns').update({ sent_count: sentCount, fail_count: failCount }).eq('id', campaignId)
    if (i + BATCH_SIZE < emails.length) await sleep(BATCH_DELAY_MS)
  }

  if (logs.length > 0) await db.from('send_logs').insert(logs)
  return { sentCount, failCount }
}

export async function POST(req: NextRequest) {
  let campaignId = ''
  try {
    const body = await req.json()
    campaignId = body.campaignId ?? ''
    const isContinue: boolean = body.isContinue ?? false
    // 첫 발송 시 프론트에서 이메일 목록 직접 전달
    const recipientEmails: string[] = body.recipientEmails ?? []

    if (!campaignId) return NextResponse.json({ error: 'campaignId 필요' }, { status: 400 })

    const db = supabaseAdmin()
    const { data: campaign, error: cErr } = await db.from('campaigns').select('*').eq('id', campaignId).single()
    if (cErr || !campaign) return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 })
    if (campaign.status === 'sending') return NextResponse.json({ error: '이미 발송 중입니다.' }, { status: 409 })

    await db.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)

    let todayEmails: string[]
    let remainingEmails: string[]

    if (isContinue) {
      // 이어서 발송: pending_emails에서 꺼내기
      const pending: string[] = campaign.pending_emails ?? []
      if (!pending.length) return NextResponse.json({ error: '대기 중인 수신자가 없습니다.' }, { status: 400 })
      todayEmails = pending.slice(0, DAILY_LIMIT)
      remainingEmails = pending.slice(DAILY_LIMIT)
    } else {
      // 첫 발송: 프론트에서 받은 이메일 목록 사용 (DB 조회 없음)
      if (!recipientEmails.length) return NextResponse.json({ error: '수신자가 없습니다.' }, { status: 400 })
      todayEmails = recipientEmails.slice(0, DAILY_LIMIT)
      remainingEmails = recipientEmails.slice(DAILY_LIMIT)

      // 전체 수신자 수 저장
      await db.from('campaigns').update({ total_count: recipientEmails.length }).eq('id', campaignId)
    }

    const { sentCount, failCount } = await sendEmails(
      todayEmails, campaign.subject, campaign.html_content, campaignId, db
    )

    const hasPending = remainingEmails.length > 0
    const prevSent = isContinue ? (campaign.sent_count ?? 0) : 0
    const prevFail = isContinue ? (campaign.fail_count ?? 0) : 0

    await db.from('campaigns').update({
      status: hasPending ? 'pending' : 'done',
      sent_count: prevSent + sentCount,
      fail_count: prevFail + failCount,
      total_count: isContinue ? campaign.total_count : recipientEmails.length,
      pending_emails: hasPending ? remainingEmails : [],
      batch_index: (campaign.batch_index ?? 0) + 1,
      sent_at: new Date().toISOString(),
    }).eq('id', campaignId)

    return NextResponse.json({
      success: true,
      sentToday: todayEmails.length,
      sentCount,
      failCount,
      remaining: remainingEmails.length,
      hasPending,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    if (campaignId) await supabaseAdmin().from('campaigns').update({ status: 'error' }).eq('id', campaignId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
