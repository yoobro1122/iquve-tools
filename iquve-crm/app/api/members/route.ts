import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function diffDays(dateStr: string, refDateStr: string): number {
  const [by, bm, bd] = dateStr.slice(0, 10).split('-').map(Number)
  const [ry, rm, rd] = refDateStr.split('-').map(Number)
  return Math.floor((Date.UTC(ry, rm-1, rd) - Date.UTC(by, bm-1, bd)) / 86400000)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const refDateStr = searchParams.get('date') ?? kstNow.toISOString().slice(0, 10)

    // service_role key로 RLS 및 row limit 우회
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey
    )

    // 전체 개수 먼저 확인
    const { count: totalCount, error: countErr } = await db
      .from('crm_members')
      .select('*', { count: 'exact', head: true })

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

    const total = totalCount ?? 0

    // 페이지네이션으로 전체 데이터 가져오기
    let allRows: Record<string, unknown>[] = []
    const PAGE = 1000

    for (let from = 0; from < total; from += PAGE) {
      const { data, error } = await db
        .from('crm_members')
        .select('*')
        .order('join_date', { ascending: false })
        .range(from, Math.min(from + PAGE - 1, total - 1))

      if (error) return NextResponse.json({
        error: error.message,
        page_from: from,
        total_count: total
      }, { status: 500 })

      if (data) allRows = allRows.concat(data)
    }

    // 그룹 분류
    const groupA14: unknown[] = [], groupB14: unknown[] = [], groupC14: unknown[] = []
    const unconvA:  unknown[] = [], unconvB:  unknown[] = [], unconvC:  unknown[] = []
    const noGroup:  unknown[] = []
    let paidCount = 0

    for (const m of allRows) {
      if (m.is_paid === true) { paidCount++; continue }

      let matched = false

      if (m.join_date && !m.has_child) {
        const d = diffDays(String(m.join_date), refDateStr)
        if (d >= 1 && d <= 14) { groupA14.push({ ...m, day_num: d, crm_group: 'A' }); matched = true }
        else if (d > 14)       { unconvA.push({ ...m, day_num: d, crm_group: 'A' });  matched = true }
      }

      if (m.profile_date && m.has_child) {
        const d = diffDays(String(m.profile_date), refDateStr)
        if (d >= 1 && d <= 14) { groupB14.push({ ...m, day_num: d, crm_group: 'B' }); matched = true }
        else if (d > 14)       { unconvB.push({ ...m, day_num: d, crm_group: 'B' });  matched = true }
      }

      if (m.trial_start && m.has_trial) {
        const d = diffDays(String(m.trial_start), refDateStr)
        if (d >= 1 && d <= 14) { groupC14.push({ ...m, day_num: d, crm_group: 'C' }); matched = true }
        else if (d > 14)       { unconvC.push({ ...m, day_num: d, crm_group: 'C' });  matched = true }
      }

      if (!matched) noGroup.push({ ...m, crm_group: 'none' })
    }

    return NextResponse.json({
      ref_date: refDateStr,
      stats: {
        total: allRows.length,
        paid: paidCount,
        unpaid: allRows.length - paidCount,
      },
      groups: {
        A: { active: groupA14, unconverted: unconvA },
        B: { active: groupB14, unconverted: unconvB },
        C: { active: groupC14, unconverted: unconvC },
        none: noGroup,
      },
      _debug: {
        db_total_count: total,
        rows_fetched: allRows.length,
        using_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        ref_date: refDateStr,
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 })
  }
}
