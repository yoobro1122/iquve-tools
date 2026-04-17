import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
 
export const runtime = 'nodejs'
export const maxDuration = 300  // 5분으로 확장 (대량 발송 대비)
 
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`
 
const BATCH_SIZE    = 50   // Resend 유료: 배치 크기 증가
const BATCH_DELAY_MS = 500  // 배치 간 딜레이 단축
const MAIL_DELAY_MS  = 20   // 메일 간 딜레이 단축
 
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
 
    if (!campaignId) return NextResponse.json({ error: 'campaignId 필요' }, { status: 400 })
 
    const { data: campaign, error: cErr } = await db
      .from('campaigns').select('*').eq('id', campaignId).single()
    if (cErr || !campaign) return NextResponse.json({ error: '캠페인 없음' }, { status: 404 })
    if (campaign.status === 'sending') return NextResponse.json({ error: '이미 발송 중' }, { status: 409 })
 
    // 발송 대상 결정 - 제한 없이 전체
    let allEmails: string[]
 
    if (isContinue) {
      allEmails = campaign.pending_emails ?? []
      if (!allEmails.length) return NextResponse.json({ error: '대기 중인 수신자가 없습니다.' }, { status: 400 })
    } else {
      if (!recipientEmails.length) return NextResponse.json({ error: '수신자가 없습니다.' }, { status: 400 })
      allEmails = recipientEmails
    }
 
    // 전체 목록 즉시 DB 저장 (중단 대비)
    await db.from('campaigns').update({
      status: 'sending',
      total_count: isContinue ? campaign.total_count : recipientEmails.length,
      pending_emails: allEmails,
      ...(isContinue ? {} : { sent_count: 0, fail_count: 0, batch_index: 0 }),
    }).eq('id', campaignId)
 
    const prevSent = isContinue ? (campaign.sent_count ?? 0) : 0
    const prevFail = isContinue ? (campaign.fail_count ?? 0) : 0
 
    let sentCount = 0, failCount = 0
    const sentEmails: string[] = []
    const logs: { campaign_id: string; email: string; status: string; error_msg?: string }[] = []
 
    // 전체 발송 (제한 없음, 배치별 중간 저장)
    for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
      const batch = allEmails.slice(i, i + BATCH_SIZE)
 
      for (const email of batch) {
        try {
          const result = await resend.emails.send({
            from: FROM, to: email,
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
 
      // 배치마다 진행 상황 저장
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
    if (logs.length > 0) await db.from('send_logs').insert(logs)
 
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
      hasPending: false,  // 더 이상 daily limit 없음
    })
 
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    if (campaignId) await db.from('campaigns').update({ status: 'error' }).eq('id', campaignId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
 
