import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`

const DAILY_LIMIT = 100
const BATCH_SIZE  = 10
const MAIL_DELAY  = 80
const BATCH_DELAY = 1500

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function GET(req: NextRequest) {
  // Vercel Cron 인증 확인
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 한국 시간 기준 현재 시각
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const kstStr = kstNow.toISOString()

  // 예약 발송 대기 중인 캠페인 조회
  // scheduled_at이 현재 시각 이전이고 status = 'scheduled'인 것
  const { data: scheduled, error } = await db
    .from('campaigns')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', kstStr)
    .order('scheduled_at', { ascending: true })
    .limit(5)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!scheduled || scheduled.length === 0) {
    return NextResponse.json({ message: '예약 발송 대상 없음', checked_at: kstStr })
  }

  const results = []

  for (const campaign of scheduled) {
    try {
      await db.from('campaigns').update({ status: 'sending' }).eq('id', campaign.id)

      const pending: string[] = campaign.pending_emails ?? []
      if (!pending.length) {
        await db.from('campaigns').update({ status: 'done' }).eq('id', campaign.id)
        continue
      }

      const todayEmails = pending.slice(0, DAILY_LIMIT)
      const remaining   = pending.slice(DAILY_LIMIT)

      let sentCount = 0, failCount = 0
      const sentEmails: string[] = []
      const logs: { campaign_id: string; email: string; status: string; error_msg?: string }[] = []

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
              logs.push({ campaign_id: campaign.id, email, status: 'failed', error_msg: result.error.message })
            } else {
              sentCount++
              sentEmails.push(email)
              logs.push({ campaign_id: campaign.id, email, status: 'sent' })
            }
          } catch (e) {
            failCount++
            logs.push({ campaign_id: campaign.id, email, status: 'failed', error_msg: String(e) })
          }
          await sleep(MAIL_DELAY)
        }

        // 배치마다 pending 업데이트
        const sentSet = new Set(sentEmails)
        const stillPending = pending.filter(e => !sentSet.has(e))
        await db.from('campaigns').update({
          sent_count: (campaign.sent_count ?? 0) + sentCount,
          fail_count: (campaign.fail_count ?? 0) + failCount,
          pending_emails: stillPending,
        }).eq('id', campaign.id)

        if (i + BATCH_SIZE < todayEmails.length) await sleep(BATCH_DELAY)
      }

      if (logs.length > 0) await db.from('send_logs').insert(logs)

      const sentSet = new Set(sentEmails)
      const finalPending = pending.filter(e => !sentSet.has(e))
      const hasPending = finalPending.length > 0

      // 다음 날 예약 시간 계산 (같은 시각, 하루 뒤)
      const nextScheduled = hasPending
        ? new Date(new Date(campaign.scheduled_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null

      await db.from('campaigns').update({
        status: hasPending ? 'scheduled' : 'done',  // 남은 게 있으면 다음날도 예약
        sent_count: (campaign.sent_count ?? 0) + sentCount,
        fail_count: (campaign.fail_count ?? 0) + failCount,
        pending_emails: finalPending,
        batch_index: (campaign.batch_index ?? 0) + 1,
        sent_at: kstStr,
        ...(nextScheduled && { scheduled_at: nextScheduled }),
      }).eq('id', campaign.id)

      results.push({
        campaign: campaign.title,
        sent: sentCount,
        failed: failCount,
        remaining: finalPending.length,
      })
    } catch (err) {
      await db.from('campaigns').update({ status: 'error' }).eq('id', campaign.id)
      results.push({ campaign: campaign.title, error: String(err) })
    }
  }

  return NextResponse.json({ success: true, results, executed_at: kstStr })
}
