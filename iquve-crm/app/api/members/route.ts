import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function diffDays(dateStr: string, refDateStr: string): number {
  const s = dateStr.slice(0, 10)
  const [by, bm, bd] = s.split('-').map(Number)
  const [ry, rm, rd] = refDateStr.split('-').map(Number)
  const base = Date.UTC(by, bm - 1, bd)
  const ref  = Date.UTC(ry, rm - 1, rd)
  return Math.floor((ref - base) / 86400000)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    // 한국 시간(UTC+9) 기준 오늘 날짜를 기본값으로
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const refDateStr = searchParams.get('date') ?? kstNow.toISOString().slice(0, 10)

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: members, error, count } = await db
      .from('crm_members')
      .select('*', { count: 'exact' })
      .order('join_date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = members ?? []

    // 디버그: is_paid 분포 확인
    const paidTrue  = rows.filter((m: Record<string, unknown>) => m.is_paid === true).length
    const paidFalse = rows.filter((m: Record<string, unknown>) => m.is_paid === false).length
    const paidNull  = rows.filter((m: Record<string, unknown>) => m.is_paid === null || m.is_paid === undefined).length

    const groupA14: unknown[] = [], groupB14: unknown[] = [], groupC14: unknown[] = []
    const unconvA:  unknown[] = [], unconvB:  unknown[] = [], unconvC:  unknown[] = []
    const noGroup:  unknown[] = []

    for (const m of rows) {
      // is_paid 체크 - true인 것만 제외 (null/false/undefined는 미결제로 처리)
      if (m.is_paid === true) continue

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
        total: count ?? rows.length,
        paid: paidTrue,
        unpaid: rows.length - paidTrue,
      },
      groups: {
        A: { active: groupA14, unconverted: unconvA },
        B: { active: groupB14, unconverted: unconvB },
        C: { active: groupC14, unconverted: unconvC },
        none: noGroup,
      },
      _debug: {
        rows_fetched: rows.length,
        is_paid_true: paidTrue,
        is_paid_false: paidFalse,
        is_paid_null: paidNull,
        ref_date: refDateStr,
        sample: rows.slice(0, 5).map((m: Record<string, unknown>) => ({
          email: m.email,
          join_date: m.join_date,
          has_child: m.has_child,
          is_paid: m.is_paid,
          diff: m.join_date ? diffDays(String(m.join_date), refDateStr) : null,
          would_be_A: m.join_date && !m.has_child && m.is_paid !== true
            ? diffDays(String(m.join_date), refDateStr)
            : 'excluded',
        })),
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 })
  }
}
