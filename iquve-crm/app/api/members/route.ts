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

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    // 전체 개수
    const { count: totalCount } = await db
      .from('crm_members')
      .select('*', { count: 'exact', head: true })
    const total = totalCount ?? 0

    // 페이지네이션으로 전체 로드
    let allRows: Record<string, unknown>[] = []
    const PAGE = 1000
    for (let from = 0; from < total; from += PAGE) {
      const { data, error } = await db
        .from('crm_members')
        .select('*')
        .order('join_date', { ascending: false })
        .range(from, Math.min(from + PAGE - 1, total - 1))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (data) allRows = allRows.concat(data)
    }

    // ─────────────────────────────────────────────
    // 그룹 분류
    //
    // member_status 기준:
    //   프로필미등록 → 그룹 A (자녀 미등록)
    //     기준일: join_date
    //   무료회원 + watch_count = 0 → 그룹 B (자녀등록, 미시청)
    //     기준일: profile_date
    //   무료회원 + watch_count > 0 → 그룹 C (자녀등록, 시청완료)
    //     기준일: last_watch_date
    //   유료회원 → 제외 (is_paid = true)
    //   탈퇴/기타 → 제외
    //
    // D+1~14 → active, D+15~ → unconverted, D+0 이하 → noGroup
    // ─────────────────────────────────────────────

    const groupA14: unknown[] = [], groupB14: unknown[] = [], groupC14: unknown[] = []
    const unconvA:  unknown[] = [], unconvB:  unknown[] = [], unconvC:  unknown[] = []
    const noGroup:  unknown[] = []
    let paidCount = 0

    for (const m of allRows) {
      const status = String(m.member_status ?? '')
      const watchCount = Number(m.watch_count ?? 0)

      // 결제/탈퇴 제외
      if (m.is_paid === true || status === '유료회원') { paidCount++; continue }
      if (status === '탈퇴회원' || status === '') continue

      let matched = false

      if (status === '프로필미등록') {
        // 그룹 A: 자녀 미등록
        if (m.join_date) {
          const d = diffDays(String(m.join_date), refDateStr)
          if (d >= 1 && d <= 14) { groupA14.push({ ...m, day_num: d, crm_group: 'A' }); matched = true }
          else if (d > 14)       { unconvA.push({ ...m, day_num: d, crm_group: 'A' });  matched = true }
        }

      } else if (status === '무료회원') {
        if (watchCount === 0) {
          // 그룹 B: 자녀등록 + 영상 미시청
          const baseDate = m.profile_date ?? m.join_date
          if (baseDate) {
            const d = diffDays(String(baseDate), refDateStr)
            if (d >= 1 && d <= 14) { groupB14.push({ ...m, day_num: d, crm_group: 'B' }); matched = true }
            else if (d > 14)       { unconvB.push({ ...m, day_num: d, crm_group: 'B' });  matched = true }
          }
        } else {
          // 그룹 C: 자녀등록 + 영상 시청
          const baseDate = m.last_watch_date ?? m.profile_date ?? m.join_date
          if (baseDate) {
            const d = diffDays(String(baseDate), refDateStr)
            if (d >= 1 && d <= 14) { groupC14.push({ ...m, day_num: d, crm_group: 'C' }); matched = true }
            else if (d > 14)       { unconvC.push({ ...m, day_num: d, crm_group: 'C' });  matched = true }
          }
        }
      }

      if (!matched) noGroup.push({ ...m, crm_group: 'none' })
    }

    const unpaid = allRows.length - paidCount

    return NextResponse.json({
      ref_date: refDateStr,
      stats: { total: allRows.length, paid: paidCount, unpaid },
      groups: {
        A: { active: groupA14, unconverted: unconvA },
        B: { active: groupB14, unconverted: unconvB },
        C: { active: groupC14, unconverted: unconvC },
        none: noGroup,
      },
      _debug: {
        rows_fetched: allRows.length,
        db_total: total,
        paid: paidCount,
        A_active: groupA14.length, A_unconv: unconvA.length,
        B_active: groupB14.length, B_unconv: unconvB.length,
        C_active: groupC14.length, C_unconv: unconvC.length,
        none: noGroup.length,
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 })
  }
}
