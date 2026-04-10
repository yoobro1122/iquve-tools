import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaign_id')
  if (!campaignId) return NextResponse.json({ error: 'campaign_id 필요' }, { status: 400 })

  const db = supabaseAdmin()

  // 페이지네이션으로 전체 로그 가져오기
  let allLogs: Record<string, unknown>[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await db
      .from('send_logs')
      .select('email, status, error_msg, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    allLogs = allLogs.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const sent   = allLogs.filter(l => l.status === 'sent')
  const failed = allLogs.filter(l => l.status === 'failed')

  return NextResponse.json({
    total: allLogs.length,
    sent_count: sent.length,
    fail_count: failed.length,
    sent:   sent.map(l => ({ email: l.email, created_at: l.created_at })),
    failed: failed.map(l => ({ email: l.email, error: l.error_msg, created_at: l.created_at })),
  })
}
