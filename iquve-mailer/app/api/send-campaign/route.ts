import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`

const DAILY_LIMIT = 100
const BATCH_SIZE = 10        // 배치 줄여서 중간 저장 더 자주
const BATCH_DELAY_MS = 1500
const MAIL_DELAY_MS = 80

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(req: NextRequest) {
  let campaignId = ''
  const db = supabaseAdmin()

  try {
    const body = await req.json()
    campaignId = body.campaignId ?? ''
    const isContinue: boolean = body.isContinue ?? false
    const recipientEmails: string[] = body.recipientEmails ?? []

    if (!campaignId) return NextResponse.json({ error: 'campaignId 필요' }, { status: 400 })

    // ── 캠페인 로드
    const { data: campaign, error: cErr } = await db
      .from('campaigns').select('*').eq('id', campaignId).single()
    if (cErr || !campaign) return NextResponse.json({ error: '캠페인 없음' }, { status: 404 })
    if (campaign.status === 'sending') return NextResponse.json({ error: '이미 발송 중' }, { status: 409 })

    // ── 오늘 보낼 목록 결정
    let todayEmails: string[]
    let allPending: string[]  // 전체 대기 목록 (오늘치 포함)

    if (isContinue) {
      allPending = campaign.pending_emails ?? []
      if (!allPending.length) return NextResponse.json({ error: '대기 중인 수신자가 없습니다.' }, { status: 400 })
      todayEmails = allPending.slice(0, DAILY_LIMIT)
    } else {
      if (!recipientEmails.length) return NextResponse.json({ error: '수신자가 없습니다.' }, { status: 400 })
      allPending = recipientEmails  // 전체가 대기 상태
      todayEmails = allPending.slice(0, DAILY_LIMIT)

      // ★ 핵심: 첫 발송 시 전체 pending_emails + total_count 즉시 저장
      // 타임아웃 나도 나머지 목록이 DB에 보존됨
      const { error: initErr } = await db.from('campaigns').update({
        status: 'sending',
        total_count: recipientEmails.length,
        pending_emails: allPending,  // 전체 목록 저장
        sent_count: 0,
        fail_count: 0,
        batch_index: 0,
      }).eq('id', campaignId)

      if (initErr) throw new Error('캠페인 초기화 실패: ' + initErr.message)
    }

    // isContinue면 sending으로만 변경
    if (isContinue) {
      await db.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)
    }

    // ── 발송 루프 (배치별 즉시 저장)
    let sentCount = 0
    let failCount = 0
    const sentEmails: string[] = []
    const logs: { campaign_id: string; email: string; status: string; error_msg?: string }[] = []

    const prevSent = isContinue ? (campaign.sent_count ?? 0) : 0
    const prevFail = isContinue ? (campaign.fail_count ?? 0) : 0

    for (let i = 0; i < todayEmails.length; i += BATCH_SIZE) {
      const batch = todayEmails.slice(i, i + BATCH_SIZE)

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

      // ★ 배치 완료마다 DB 즉시 업데이트
      // pending_emails에서 보낸 것들 제거 → 중단돼도 이어서 발송 가능
      const sentSet = new Set(sentEmails)
      const remainingPending = allPending.filter(e => !sentSet.has(e))

      await db.from('campaigns').update({
        sent_count: prevSent + sentCount,
        fail_count: prevFail + failCount,
        pending_emails: remainingPending,  // 이미 보낸 것 제거
      }).eq('id', campaignId)

      if (i + BATCH_SIZE < todayEmails.length) await sleep(BATCH_DELAY_MS)
    }

    // ── 로그 저장
    if (logs.length > 0) {
      await db.from('send_logs').insert(logs)
    }

    // ── 최종 상태 저장
    const sentSet = new Set(sentEmails)
    const finalPending = allPending.filter(e => !sentSet.has(e))
    const hasPending = finalPending.length > 0

    await db.from('campaigns').update({
      status: hasPending ? 'pending' : 'done',
      sent_count: prevSent + sentCount,
      fail_count: prevFail + failCount,
      pending_emails: finalPending,
      batch_index: (campaign.batch_index ?? 0) + 1,
      sent_at: new Date().toISOString(),
    }).eq('id', campaignId)

    return NextResponse.json({
      success: true,
      sentToday: sentCount,
      sentCount: prevSent + sentCount,
      failCount: prevFail + failCount,
      remaining: finalPending.length,
      hasPending,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('[send-campaign] error:', msg)

    // ★ 오류 시에도 status만 error로 변경 (pending_emails는 유지!)
    if (campaignId) {
      await db.from('campaigns')
        .update({ status: 'error' })
        .eq('id', campaignId)
    }

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
