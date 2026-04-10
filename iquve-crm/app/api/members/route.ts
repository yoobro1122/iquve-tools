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

    // 전체 개수 확인
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

    // ──────────────────────────────────────────
    // 그룹 분류 로직
    //
    // 결제 완료 → 제외
    // 그룹 A: 자녀 미등록 (has_child=false, profile_date 없음)
    //   기준일: 가입일(join_date)
    // 그룹 B: 자녀 등록 완료 + 영상 시청 없음 (watch_count=0)
    //   기준일: 프로필등록일(profile_date)
    // 그룹 C: 자녀 등록 완료 + 영상 시청 있음 (watch_count>0)
    //   기준일: 최종영상시청일(last_watch_date)
    // 미전환: 각 그룹 D+14 초과
    // 그룹 없음: D+0 이하 (오늘 가입 등)
    // ──────────────────────────────────────────

    const groupA14: unknown[] = [], groupB14: unknown[] = [], groupC14: unknown[] = []
    const unconvA:  unknown[] = [], unconvB:  unknown[] = [], unconvC:  unknown[] = []
    const noGroup:  unknown[] = []
    let paidCount = 0

    for (const m of allRows) {
      if (m.is_paid === true) { paidCount++; continue }

      const hasChild    = m.has_child === true || !!m.profile_date
      const hasWatched  = (Number(m.watch_count ?? 0)) > 0 || !!m.last_watch_date
      let matched = false

      if (!hasChild) {
        // ── 그룹 A: 자녀 미등록
        if (m.join_date) {
          const d = diffDays(String(m.join_date), refDateStr)
          if (d >= 1 && d <= 14) { groupA14.push({ ...m, day_num: d, crm_group: 'A' }); matched = true }
          else if (d > 14)       { unconvA.push({ ...m, day_num: d, crm_group: 'A' });  matched = true }
        }
      } else if (!hasWatched) {
        // ── 그룹 B: 자녀 등록 + 영상 미시청
        const baseDate = m.profile_date ?? m.join_date
        if (baseDate) {
          const d = diffDays(String(baseDate), refDateStr)
          if (d >= 1 && d <= 14) { groupB14.push({ ...m, day_num: d, crm_group: 'B' }); matched = true }
          else if (d > 14)       { unconvB.push({ ...m, day_num: d, crm_group: 'B' });  matched = true }
        }
      } else {
        // ── 그룹 C: 자녀 등록 + 영상 시청 완료
        const baseDate = m.last_watch_date ?? m.profile_date ?? m.join_date
        if (baseDate) {
          const d = diffDays(String(baseDate), refDateStr)
          if (d >= 1 && d <= 14) { groupC14.push({ ...m, day_num: d, crm_group: 'C' }); matched = true }
          else if (d > 14)       { unconvC.push({ ...m, day_num: d, crm_group: 'C' });  matched = true }
        }
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
        A_active: groupA14.length, A_unconv: unconvA.length,
        B_active: groupB14.length, B_unconv: unconvB.length,
        C_active: groupC14.length, C_unconv: unconvC.length,
        none: noGroup.length,
        paid: paidCount,
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '오류' }, { status: 500 })
  }
}
