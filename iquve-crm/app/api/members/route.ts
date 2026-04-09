import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'

function diffDays(dateStr: string, today: Date): number {
  const d = new Date(dateStr)
  const t = new Date(today.toDateString())
  const b = new Date(d.toDateString())
  return Math.floor((t.getTime() - b.getTime()) / 86400000)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const refDateStr = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
    const today = new Date(refDateStr)

    // 전체 미결제 회원 가져오기
    const { data, error } = await supabase
      .from('crm_members')
      .select('*')
      .eq('is_paid', false)
      .order('join_date', { ascending: false })

    if (error) throw error
    const members = data ?? []

    // 그룹별 분류
    const groupA14: unknown[] = []  // 가입 후 D+1~14 (자녀 미등록)
    const groupB14: unknown[] = []  // 자녀등록 후 D+1~14
    const groupC14: unknown[] = []  // 체험시작 후 D+1~14
    const unconvA: unknown[] = []   // A그룹 14일 초과 미전환
    const unconvB: unknown[] = []   // B그룹 14일 초과 미전환
    const unconvC: unknown[] = []   // C그룹 14일 초과 미전환

    for (const m of members) {
      // 그룹 A: 가입 후, 자녀 미등록
      if (m.join_date && !m.has_child) {
        const d = diffDays(m.join_date, today)
        if (d >= 1 && d <= 14) groupA14.push({ ...m, day_num: d, crm_group: 'A' })
        else if (d > 14) unconvA.push({ ...m, day_num: d, crm_group: 'A' })
      }

      // 그룹 B: 자녀등록 후 (profile_date 기준), 미결제
      if (m.profile_date && m.has_child) {
        const d = diffDays(m.profile_date, today)
        if (d >= 1 && d <= 14) groupB14.push({ ...m, day_num: d, crm_group: 'B' })
        else if (d > 14) unconvB.push({ ...m, day_num: d, crm_group: 'B' })
      }

      // 그룹 C: 체험시작 후, 미결제
      if (m.trial_start && m.has_trial) {
        const d = diffDays(m.trial_start, today)
        if (d >= 1 && d <= 14) groupC14.push({ ...m, day_num: d, crm_group: 'C' })
        else if (d > 14) unconvC.push({ ...m, day_num: d, crm_group: 'C' })
      }
    }

    // 총 회원 수 통계
    const { count: totalCount } = await supabase
      .from('crm_members')
      .select('*', { count: 'exact', head: true })

    const { count: paidCount } = await supabase
      .from('crm_members')
      .select('*', { count: 'exact', head: true })
      .eq('is_paid', true)

    return NextResponse.json({
      ref_date: refDateStr,
      stats: {
        total: totalCount ?? 0,
        paid: paidCount ?? 0,
        unpaid: members.length,
      },
      groups: {
        A: { active: groupA14, unconverted: unconvA },
        B: { active: groupB14, unconverted: unconvB },
        C: { active: groupC14, unconverted: unconvC },
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '오류'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
