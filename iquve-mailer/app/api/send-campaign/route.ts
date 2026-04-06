import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import type { Category } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`

// Resend free tier: 100 emails/day, batch safely
const BATCH_SIZE = 50
const BATCH_DELAY_MS = 1000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { campaignId } = body as { campaignId: string }
    if (!campaignId) return NextResponse.json({ error: 'campaignId 필요' }, { status: 400 })

    const db = supabaseAdmin()

    // 캠페인 로드
    const { data: campaign, error: cErr } = await db
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()
    if (cErr || !campaign) return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 })
    if (campaign.status === 'sending') return NextResponse.json({ error: '이미 발송 중입니다.' }, { status: 409 })

    // 상태 → sending
    await db.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)

    // 수신자 조회
    const groups: Category[] = campaign.groups
    const { data: members, error: mErr } = await db
      .from('members')
      .select('email')
      .in('category', groups)
    if (mErr || !members) throw new Error('회원 조회 실패')

    const emails = members.map((m: { email: string }) => m.email)
    let sentCount = 0
    let failCount = 0
    const logs: { campaign_id: string; email: string; status: string; error_msg?: string }[] = []

    // 배치 발송
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map((email: string) =>
          resend.emails.send({
            from: FROM,
            to: email,
            subject: campaign.subject,
            html: campaign.html_content,
          })
        )
      )

      for (let j = 0; j < batch.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled' && !r.value.error) {
          sentCount++
          logs.push({ campaign_id: campaignId, email: batch[j], status: 'sent' })
        } else {
          failCount++
          const errMsg =
            r.status === 'rejected'
              ? String(r.reason)
              : r.value.error?.message ?? '알 수 없는 오류'
          logs.push({ campaign_id: campaignId, email: batch[j], status: 'failed', error_msg: errMsg })
        }
      }

      // 중간 진행률 업데이트
      await db
        .from('campaigns')
        .update({ sent_count: sentCount, fail_count: failCount })
        .eq('id', campaignId)

      if (i + BATCH_SIZE < emails.length) await sleep(BATCH_DELAY_MS)
    }

    // 로그 저장
    if (logs.length > 0) {
      await db.from('send_logs').insert(logs)
    }

    // 최종 상태 업데이트
    await db.from('campaigns').update({
      status: 'done',
      total_count: emails.length,
      sent_count: sentCount,
      fail_count: failCount,
      sent_at: new Date().toISOString(),
    }).eq('id', campaignId)

    return NextResponse.json({ success: true, total: emails.length, sentCount, failCount })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
