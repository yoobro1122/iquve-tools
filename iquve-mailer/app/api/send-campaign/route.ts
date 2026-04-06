import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import type { Category } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`

// ─── 스팸 방지 배치 설정 ──────────────────────────────────────────────────────
// 30건씩 묶어서 순차 발송, 배치 사이 2초 대기, 각 메일 사이 100ms 간격
const BATCH_SIZE = 30
const BATCH_DELAY_MS = 2000
const MAIL_DELAY_MS = 100

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function POST(req: NextRequest) {
  let campaignId = ''
  try {
    const body = await req.json()
    campaignId = body.campaignId ?? ''
    if (!campaignId) return NextResponse.json({ error: 'campaignId 필요' }, { status: 400 })

    const db = supabaseAdmin()

    const { data: campaign, error: cErr } = await db
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()
    if (cErr || !campaign) return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 })
    if (campaign.status === 'sending') return NextResponse.json({ error: '이미 발송 중입니다.' }, { status: 409 })

    await db.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)

    // DB 그룹 + 수기 입력 이메일 합산
    const groups: Category[] = campaign.groups
    const extraEmails: string[] = campaign.extra_emails ?? []

    const { data: members, error: mErr } = await db
      .from('members')
      .select('email')
      .in('category', groups)
    if (mErr || !members) throw new Error('회원 조회 실패')

    const allEmails = Array.from(
      new Set([...members.map((m: { email: string }) => m.email), ...extraEmails])
    )

    let sentCount = 0
    let failCount = 0
    const logs: { campaign_id: string; email: string; status: string; error_msg?: string }[] = []

    // ─── 배치 순차 발송 ───────────────────────────────────────────────────────
    for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
      const batch = allEmails.slice(i, i + BATCH_SIZE)

      for (const email of batch) {
        try {
          const result = await resend.emails.send({
            from: FROM,
            to: email,
            subject: campaign.subject,
            html: campaign.html_content,
          })
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

      await db
        .from('campaigns')
        .update({ sent_count: sentCount, fail_count: failCount })
        .eq('id', campaignId)

      if (i + BATCH_SIZE < allEmails.length) await sleep(BATCH_DELAY_MS)
    }

    if (logs.length > 0) await db.from('send_logs').insert(logs)

    await db.from('campaigns').update({
      status: 'done',
      total_count: allEmails.length,
      sent_count: sentCount,
      fail_count: failCount,
      sent_at: new Date().toISOString(),
    }).eq('id', campaignId)

    return NextResponse.json({ success: true, total: allEmails.length, sentCount, failCount })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    if (campaignId) {
      const db = supabaseAdmin()
      await db.from('campaigns').update({ status: 'error' }).eq('id', campaignId)
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
