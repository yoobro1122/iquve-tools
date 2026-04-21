import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`

const BATCH_SIZE  = 10
const MAIL_DELAY  = 600  // 초당 2건 제한 → 600ms 간격
const BATCH_DELAY = 1000

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const kstStr = kstNow.toISOString()

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
      const pending: string[] = campaign.pending_emails ?? []
      if (!pending.length) {
        await db.from('campaigns').update({ status: 'done' }).eq('id', campaign.id)
        continue
      }

      // 제한 없이 전체 발송
      await db.from('campaigns').update({
        status: 'sending',
        pending_emails: pending,
      }).eq('id', campaign.id)

      let sentCount = 0, failCount = 0
      const sentEmails: string[] = []
      const logs: { campaign_id: string; email: string; status: string; error_msg?: string }[] = []

      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE)
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

        // 배치마다 진행 저장
        const sentSet = new Set(sentEmails)
        await db.from('campaigns').update({
          sent_count: (campaign.sent_count ?? 0) + sentCount,
          fail_count: (campaign.fail_count ?? 0) + failCount,
          pending_emails: pending.filter(e => !sentSet.has(e)),
        }).eq('id', campaign.id)

        if (i + BATCH_SIZE < pending.length) await sleep(BATCH_DELAY)
      }

      if (logs.length > 0) await db.from('send_logs').insert(logs)

      const sentSet = new Set(sentEmails)
      const finalPending = pending.filter(e => !sentSet.has(e))

      await db.from('campaigns').update({
        status: finalPending.length > 0 ? 'error' : 'done',
        sent_count: (campaign.sent_count ?? 0) + sentCount,
        fail_count: (campaign.fail_count ?? 0) + failCount,
        pending_emails: finalPending,
        batch_index: (campaign.batch_index ?? 0) + 1,
        sent_at: kstStr,
      }).eq('id', campaign.id)

      results.push({ campaign: campaign.title, sent: sentCount, failed: failCount })
    } catch (err) {
      await db.from('campaigns').update({ status: 'error' }).eq('id', campaign.id)
      results.push({ campaign: campaign.title, error: String(err) })
    }
  }

  return NextResponse.json({ success: true, results, executed_at: kstStr })
}
