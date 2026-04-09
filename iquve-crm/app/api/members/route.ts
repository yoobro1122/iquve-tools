import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function diffDays(dateStr: string, refDateStr: string): number {
  const [by, bm, bd] = dateStr.slice(0, 10).split('-').map(Number)
  const [ry, rm, rd] = refDateStr.slice(0, 10).split('-').map(Number)
  const base = Date.UTC(by, bm - 1, bd)
  const ref  = Date.UTC(ry, rm - 1, rd)
  return Math.floor((ref - base) / 86400000)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const refDateStr = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

    // 환경변수 직접 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        error: '환경변수 없음',
        has_url: !!supabaseUrl,
        has_key: !!supabaseKey,
      }, { status: 500 })
    }

    // 매 요청마다 새 클라이언트 생성 (캐싱 문제 방지)
    const db = createClient(supabaseUrl, supabaseKey)

    // 전체 조회 (필터 없이)
    const { data: members, error, count } = await db
      .from('crm_members')
      .select('*', { count: 'exact' })
      .order('join_date', { ascending: false })

    if (error) {
      return NextResponse.json({
        error: 'DB 조회 실패',
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }, { status: 500 })
    }

    const rows = members ?? []

    const groupA14: unknown[] = [], groupB14: unknown[] = [], groupC14: unknown[] = []
    const unconvA:  unknown[] = [], unconvB:  unknown[] = [], unconvC:  unknown[] = []
    const noGroup:  unknown[] = []

    for (const m of rows) {
      if (m.is_paid) continue

      let matched = false

      // 그룹 A: 가입 후, 자녀 미등록
      if (m.join_date && !m.has_child) {
        const d = diffDays(m.join_date, refDateStr)
        if (d >= 1 && d <= 14) { groupA14.push({ ...m, day_num: d, crm_group: 'A' }); matched = true }
        else if (d > 14)       { unconvA.push({ ...m, day_num: d, crm_group: 'A' });  matched = true }
      }

      // 그룹 B: 자녀등록 후, 미결제
      if (m.profile_date && m.has_child) {
        const d = diffDays(m.profile_date, refDateStr)
        if (d >= 1 && d <= 14) { groupB14.push({ ...m, day_num: d, crm_group: 'B' }); matched = true }
        else if (d > 14)       { unconvB.push({ ...m, day_num: d, crm_group: 'B' });  matched = true }
      }

      // 그룹 C: 체험 시작 후, 미결제
      if (m.trial_start && m.has_trial) {
        const d = diffDays(m.trial_start, refDateStr)
        if (d >= 1 && d <= 14) { groupC14.push({ ...m, day_num: d, crm_group: 'C' }); matched = true }
        else if (d > 14)       { unconvC.push({ ...m, day_num: d, crm_group: 'C' });  matched = true }
      }

      if (!matched) noGroup.push({ ...m, crm_group: 'none' })
    }

    const paid  = rows.filter((m: { is_paid: boolean }) => m.is_paid).length

    return NextResponse.json({
      ref_date: refDateStr,
      stats: {
        total: count ?? rows.length,
        paid,
        unpaid: rows.length - paid,
      },
      groups: {
        A: { active: groupA14, unconverted: unconvA },
        B: { active: groupB14, unconverted: unconvB },
        C: { active: groupC14, unconverted: unconvC },
        none: noGroup,
      },
      _debug: {
        env_ok: true,
        rows_fetched: rows.length,
        count_from_db: count,
        sample: rows.slice(0, 3).map((m: Record<string, unknown>) => ({
          email: m.email,
          join_date: m.join_date,
          has_child: m.has_child,
          is_paid: m.is_paid,
          diff: m.join_date ? diffDays(String(m.join_date), refDateStr) : null,
        })),
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : '알 수 없는 오류',
      stack: err instanceof Error ? err.stack?.slice(0, 300) : undefined,
    }, { status: 500 })
  }
}
