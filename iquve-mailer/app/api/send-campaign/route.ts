import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300

const resend = new Resend(process.env.RESEND_API_KEY)
const DEFAULT_FROM = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`
const SENDER_MAP: Record<string, string> = {
  'iquve@growv.com': `아이큐브 <iquve@growv.com>`,
  'shyou@growv.com': `유승훈 <shyou@growv.com>`,
}

// Resend 유료 기준: 초당 10건 → 100ms 간격
const MAIL_DELAY_MS = 100
const BATCH_SIZE    = 50   // 50건씩 처리 후 DB 저장
const BATCH_DELAY_MS = 100

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(req: NextRequest) {
  let campaignId = ''
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  try {
    const body = await req.json()
    campaignId = body.campaignId ?? ''
    const isContinue: boolean = body.isContinue ?? false
    const recipientEmails: string[] = body.recipientEmails ?? []
    const fromEmail: string = body.fromEmail ?? ''
    const batchStart: number = body.batchStart ?? 0  // 이어서 보낼 시작 인덱스

    if (!campaignId) return NextResponse.json({ error: 'campaignId 필요' }, { status: 400 })

    const { data: campaign, error: cErr } = await db
      .from('campaigns').select('*').eq('id', campaignId).single()
    if (cErr || !campaign) return NextResponse.json({ error: '캠페인 없음' }, { status: 404 })
    if (campaign.status === 'sending' && !isContinue && batchStart === 0) {
      return NextResponse.json({ error: '이미 발송 중' }, { status: 409 })
    }

    const resolvedFrom = SENDER_MAP[fromEmail] ?? SENDER_MAP[campaign.from_email] ?? DEFAULT_FROM

    // 발송 대상 결정
    let allEmails: string[]
    if (isContinue) {
      allEmails = campaign.pending_emails ?? []
      if (!allEmails.length) return NextResponse.json({ error: '대기 중인 수신자 없음' }, { status: 400 })
    } else {
      if (!recipientEmails.length) return NextResponse.json({ error: '수신자 없음' }, { status: 400 })
      allEmails = recipientEmails
    }

    // 첫 호출 시 전체 목록 즉시 DB 저장
    if (batchStart === 0 && !isContinue) {
      await db.from('campaigns').update({
        status: 'sending',
        total_count: allEmails.length,
        pending_emails: allEmails,
        sent_count: 0,
        fail_count: 0,
        batch_index: 0,
        from_email: fromEmail || campaign.from_email || 'iquve@growv.com',
      }).eq('id', campaignId)
    } else {
      await db.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)
    }

    const prevSent = isContinue ? (campaign.sent_count ?? 0) : 0
    const prevFail = isContinue ? (campaign.fail_count ?? 0) : 0

    let sentCount = 0, failCount = 0
    const sentEmails: string[] = []
    const logs: { campaign_id: string; email: string; status: string; error_msg?: string }[] = []

    // 발송 루프
    for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
      const batch = allEmails.slice(i, i + BATCH_SIZE)

      for (const email of batch) {
        try {
          const result = await resend.emails.send({
            from: resolvedFrom,
            to: email,
            subject: campaign.subject,
            html: campaign.html_content,
          })
          if (result.error) {
            failCount++
            logs.push({ campaign_id: campaignId, email, status: 'failed', error_msg: result.error.message })
          } else {
            sentCount++
            sentEmails.push(email)
            logs.push({ campaign_id: campaignId, email, status: 'sent' })
          }
        } catch (e) {
          failCount++
          logs.push({ campaign_id: campaignId, email, status: 'failed', error_msg: String(e) })
        }
        await sleep(MAIL_DELAY_MS)
      }

      // 배치마다 즉시 DB 저장
      const sentSet = new Set(sentEmails)
      const remaining = allEmails.filter(e => !sentSet.has(e))
      await db.from('campaigns').update({
        sent_count: prevSent + sentCount,
        fail_count: prevFail + failCount,
        pending_emails: remaining,
      }).eq('id', campaignId)

      if (i + BATCH_SIZE < allEmails.length) await sleep(BATCH_DELAY_MS)
    }

    // 로그 저장
    if (logs.length > 0) {
      // 로그가 많으면 500건씩 나눠서 insert
      const LOG_CHUNK = 500
      for (let i = 0; i < logs.length; i += LOG_CHUNK) {
        await db.from('send_logs').insert(logs.slice(i, i + LOG_CHUNK))
      }
    }

    // 최종 상태
    const sentSet = new Set(sentEmails)
    const finalPending = allEmails.filter(e => !sentSet.has(e))

    await db.from('campaigns').update({
      status: finalPending.length > 0 ? 'error' : 'done',
      sent_count: prevSent + sentCount,
      fail_count: prevFail + failCount,
      pending_emails: finalPending,
      batch_index: (campaign.batch_index ?? 0) + 1,
      sent_at: new Date().toISOString(),
    }).eq('id', campaignId)

    return NextResponse.json({
      success: true,
      sentCount: prevSent + sentCount,
      failCount: prevFail + failCount,
      remaining: finalPending.length,
      hasPending: false,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '오류'
    console.error('[send-campaign]', msg)
    // 오류 시에도 pending_emails 보존 (status만 error로)
    if (campaignId) {
      await db.from('campaigns').update({ status: 'error' }).eq('id', campaignId)
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
