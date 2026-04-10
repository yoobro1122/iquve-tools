import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

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

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── 전체 데이터 페이지네이션으로 가져오기 (1000행 제한 우회)
    let allRows: Record<string, unknown>[] = []
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await db
        .from('crm_members')
        .select('*')
        .order('join_date', { ascending: false })
        .range(from, from + PAGE - 1)

      if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
      if (!data || data.length === 0) break

      allRows = allRows.concat(data)
      if (data.length < PAGE) break  // 마지막 페이지
      from += PAGE
    }

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

    const total   = allRows.length
    const unpaid  = total - paidCount

    return NextResponse.json({
      ref_date: refDateStr,
      stats: { total, paid: paidCount, unpaid },
      groups: {
        A: { active: groupA14, unconverted: unconvA },
        B: { active: groupB14, unconverted: unconvB },
        C: { active: groupC14, unconverted: unconvC },
        none: noGroup,
      },
      _debug: {
        rows_fetched: allRows.length,
        paid: paidCount,
        unpaid,
        A_active: groupA14.length,
        A_unconv: unconvA.length,
        none: noGroup.length,
        ref_date: refDateStr,
        sample: allRows.slice(0, 3).map(m => ({
          email: m.email,
          join_date: m.join_date,
          has_child: m.has_child,
          is_paid: m.is_paid,
          diff: m.join_date ? diffDays(String(m.join_date), refDateStr) : null,
        })),
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 })
  }
}
