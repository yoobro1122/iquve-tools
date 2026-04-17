import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
 
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
 
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaign_id')
  if (!campaignId) return NextResponse.json({ error: 'campaign_id 필요' }, { status: 400 })
 
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
 
    let allLogs: Record<string, unknown>[] = []
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await db
        .from('send_logs')
        .select('email, status, error_msg')
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
      sent:   sent.map(l => ({ email: l.email })),
      failed: failed.map(l => ({ email: l.email, error: l.error_msg })),
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 })
  }
}
