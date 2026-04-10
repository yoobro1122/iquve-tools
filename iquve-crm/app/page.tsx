'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CrmMember {
  id: string; email: string; parent_name: string | null; child_name: string | null
  phone: string | null; social_type: string | null; member_status: string | null
  join_date: string | null; profile_date: string | null
  trial_start: string | null; trial_end: string | null
  has_child: boolean; has_trial: boolean; is_paid: boolean
  pay_count: number; pay_total: number; last_pay_date: string | null
  day_num?: number; crm_group?: string
}

interface GroupData { active: CrmMember[]; unconverted: CrmMember[] }
interface ApiData {
  ref_date: string
  stats: { total: number; paid: number; unpaid: number }
  groups: { A: GroupData; B: GroupData; C: GroupData; none?: CrmMember[] }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GROUP_META = {
  A: {
    icon: '🆕', label: '가입 후 유도', color: '#0284c7', bg: '#e0f2fe',
    desc: '자녀 미등록 · 기준: 가입일 D+1~14',
    unconvDesc: '가입 후 14일 초과 · 자녀 미등록 상태',
    refLabel: '가입일',
  },
  B: {
    icon: '👶', label: '자녀등록 후 시청유도', color: '#6d28d9', bg: '#ede9fe',
    desc: '자녀 등록 완료 + 영상 미시청 · 기준: 프로필등록일 D+1~14',
    unconvDesc: '프로필등록 후 14일 초과 · 미시청 상태',
    refLabel: '프로필등록일',
  },
  C: {
    icon: '▶️', label: '시청 후 결제유도', color: '#b45309', bg: '#fef3c7',
    desc: '자녀 등록 + 영상 시청 완료 · 기준: 최종시청일 D+1~14',
    unconvDesc: '시청 후 14일 초과 · 미결제 상태',
    refLabel: '최종시청일',
  },
} as const

const NONE_META = {
  icon: '👤', label: '그룹 미해당', color: '#64748b', bg: '#f1f5f9',
  desc: '오늘 가입했거나 가입일 정보 없는 회원',
  unconvDesc: '',
  refLabel: '가입일',
}

type GroupKey = 'A' | 'B' | 'C' | 'none'
type ViewMode = 'active' | 'unconverted'

// ─── Component ────────────────────────────────────────────────────────────────
export default function Home() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [refDate, setRefDate] = useState(() => {
    // 한국 시간(UTC+9) 기준 오늘 날짜
    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    return kst.toISOString().slice(0, 10)
  })
  const [curGroup, setCurGroup] = useState<GroupKey>('A')
  const [viewMode, setViewMode] = useState<ViewMode>('active')
  const [search, setSearch] = useState('')
  const [dayFilter, setDayFilter] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string, type: 'ok' | 'err' | 'info' = 'info') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  // ── 데이터 로드 ──
  const loadData = useCallback(async (date?: string) => {
    setLoading(true)
    try {
      const d = date ?? refDate
      const res = await fetch(`/api/members?date=${d}&_t=${Date.now()}`)  // 캐시 방지
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '오류', 'err')
    } finally { setLoading(false) }
  }, [refDate])

  useEffect(() => { loadData() }, [loadData])

  // ── 파일 업로드 ──
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('files', f))
      const res = await fetch('/api/upsert-members', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      const summary = json.files.map((f: { name: string; type: string; count: number }) =>
        `${f.name} → ${f.type}(${f.count}명)`
      ).join(', ')
      showToast(`✅ ${json.total}명 업데이트 완료 | ${summary}`, 'ok')
      await loadData()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '업로드 오류', 'err')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── 현재 보여줄 데이터 ──
  function getCurrentList(): CrmMember[] {
    if (!data) return []
    let list: CrmMember[]
    if (curGroup === 'none') {
      list = data.groups.none ?? []
    } else {
      list = data.groups[curGroup][viewMode === 'active' ? 'active' : 'unconverted']
    }
    const q = search.trim().toLowerCase()
    return list.filter(m => {
      if (dayFilter !== null && m.day_num !== dayFilter) return false
      if (!q) return true
      return (m.email ?? '').includes(q) ||
        (m.parent_name ?? '').includes(q) ||
        (m.child_name ?? '').toLowerCase().includes(q)
    })
  }

  // ── 다운로드 ──
  function downloadCurrent() {
    const list = getCurrentList()
    if (!list.length) { showToast('다운로드할 데이터가 없어요', 'err'); return }
    const meta = curGroup === 'none' ? NONE_META : GROUP_META[curGroup as 'A'|'B'|'C']
    const rows = list.map((m, i) => ({
      'No': i + 1,
      '그룹': curGroup,
      '이메일': m.email,
      '학부모명': m.parent_name ?? '',
      '자녀이름': m.child_name ?? '',
      '전화번호': fmtPhone(m.phone),
      [meta.refLabel]: viewMode === 'active' ? getRefDate(m, curGroup) : getRefDate(m, curGroup),
      '경과일(D+)': m.day_num ?? '',
      '가입일': m.join_date ?? '',
      '유형': viewMode === 'active' ? `D+${m.day_num} 발송대상` : '미전환',
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 5 }, { wch: 6 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, `그룹${curGroup}_${viewMode}`)
    const label = viewMode === 'active' ? `발송대상` : '미전환'
    XLSX.writeFile(wb, `iQuve_CRM_그룹${curGroup}_${label}_${refDate}.xlsx`)
    showToast(`${list.length.toLocaleString()}명 다운로드`, 'ok')
  }

  function getRefDate(m: CrmMember, g: GroupKey): string {
    if (g === 'A') return m.join_date ?? ''
    if (g === 'B') return m.profile_date ?? m.join_date ?? ''
    if (g === 'C') return (m as unknown as Record<string, unknown>)['last_watch_date'] as string ?? m.profile_date ?? m.join_date ?? ''
    return m.join_date ?? ''
  }

  function fmtPhone(p: string | null): string {
    if (!p) return ''
    if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`
    if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`
    return p
  }

  function fmtDate(d: string | null): string {
    if (!d) return '—'
    return d.slice(5)  // MM-DD
  }

  function dayColor(d: number): string {
    if (d <= 3) return '#dc2626'
    if (d <= 7) return '#d97706'
    return '#16a34a'
  }
  function dayBg(d: number): string {
    if (d <= 3) return '#fee2e2'
    if (d <= 7) return '#fef3c7'
    return '#dcfce7'
  }

  const curList = getCurrentList()
  const curMeta = curGroup === 'none' ? NONE_META : GROUP_META[curGroup as 'A'|'B'|'C']
  const today = new Date(new Date().getTime() + 9*60*60*1000).toISOString().slice(0,10).replace(/-/g,'.')  + ' (KST)'

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f1f4fb' }}>

      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg,#4355e8,#6b7df5)',
        padding: '0 32px', height: 56, display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 2px 16px rgba(67,85,232,.28)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: -.5 }}>
          iQuve <span style={{ fontWeight: 400, fontSize: 13, opacity: .6 }}>CRM 대시보드</span>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: 'rgba(255,255,255,.75)' }}>{today}</div>
        {data && (
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { label: '전체', val: data.stats.total },
              { label: '결제', val: data.stats.paid },
              { label: '미결제', val: data.stats.unpaid },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: '4px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{s.val.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </header>

      <div style={{ maxWidth: 1100, margin: '24px auto', padding: '0 24px' }}>

        {/* ── 업로드 + 날짜 컨트롤 ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {/* 업로드 */}
          <div style={{ flex: 1, minWidth: 300, background: 'white', borderRadius: 14, padding: '18px 20px', border: '1px solid #e2e8f4' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>📂 엑셀 파일 업로드</div>
            <div style={{ fontSize: 12, color: '#7c88a4', marginBottom: 12, lineHeight: 1.6 }}>
              유저 상세, 결제 내역, 회원 목록 등 어떤 파일이든 업로드하면<br />
              자동으로 감지해서 기존 DB에 누적·업데이트합니다.
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px', border: '2.5px dashed #a5b4fc', borderRadius: 10,
              cursor: uploading ? 'not-allowed' : 'pointer', background: '#f5f7ff',
              opacity: uploading ? .6 : 1, transition: 'all .18s',
            }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple
                style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
              <span style={{ fontSize: 20 }}>{uploading ? '⏳' : '📤'}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#4355e8' }}>
                {uploading ? '처리 중...' : '파일 선택 (여러 개 가능)'}
              </span>
            </label>
          </div>

          {/* 날짜 + 새로고침 */}
          <div style={{ background: 'white', borderRadius: 14, padding: '18px 20px', border: '1px solid #e2e8f4', display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>📅 기준 날짜</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={refDate}
                onChange={e => { setRefDate(e.target.value); loadData(e.target.value) }}
                style={{ padding: '8px 12px', border: '1.5px solid #e2e8f4', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#1a1d2e' }} />
              <button onClick={() => loadData()}
                style={{ padding: '9px 16px', background: '#4355e8', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {loading ? '로딩...' : '🔄 새로고침'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>다른 날짜로 조회하거나 테스트할 수 있어요</div>
          </div>
        </div>

        {/* ── 그룹 카드 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
          {(Object.entries(GROUP_META) as [('A'|'B'|'C'), typeof GROUP_META['A']][]).map(([key, meta]) => {
            const active = data?.groups[key].active.length ?? 0
            const unconv = data?.groups[key].unconverted.length ?? 0
            const isCur = curGroup === key
            return (
              <div key={key} onClick={() => { setCurGroup(key); setViewMode('active'); setSearch(''); setDayFilter(null) }}
                style={{
                  background: 'white', borderRadius: 14, padding: '20px',
                  border: `2px solid ${isCur ? meta.color : '#e2e8f4'}`,
                  boxShadow: isCur ? `0 4px 20px rgba(0,0,0,.1)` : '0 2px 8px rgba(0,0,0,.04)',
                  cursor: 'pointer', transition: 'all .18s', position: 'relative', overflow: 'hidden',
                }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: meta.color }} />
                <div style={{ fontSize: 24, marginBottom: 8 }}>{meta.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#7c88a4', letterSpacing: .5, marginBottom: 4 }}>그룹 {key} · {meta.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 34, fontWeight: 900, color: meta.color, lineHeight: 1 }}>{active.toLocaleString()}</span>
                  <span style={{ fontSize: 13, color: '#7c88a4' }}>명 발송대상</span>
                </div>
                <div style={{ fontSize: 11, color: '#7c88a4', marginBottom: 10, lineHeight: 1.5 }}>{meta.desc}</div>
                <button
                  onClick={e => { e.stopPropagation(); setCurGroup(key); setViewMode('unconverted'); setSearch('') }}
                  style={{
                    padding: '5px 12px', border: '1px solid #e2e8f4', borderRadius: 20,
                    background: unconv > 0 ? '#fee2e2' : '#f8fafc',
                    color: unconv > 0 ? '#dc2626' : '#94a3b8',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  ⚠️ 미전환 {unconv.toLocaleString()}명
                </button>
              </div>
            )
          })}
        </div>

        {/* 그룹 없음 카드 */}
        {data && (
          <div
            onClick={() => { setCurGroup('none'); setViewMode('active'); setSearch('') }}
            style={{
              background: 'white', borderRadius: 14, padding: '16px 20px',
              border: `2px solid ${curGroup === 'none' ? '#64748b' : '#e2e8f4'}`,
              boxShadow: curGroup === 'none' ? '0 4px 16px rgba(0,0,0,.1)' : '0 2px 8px rgba(0,0,0,.04)',
              cursor: 'pointer', transition: 'all .18s', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
            <span style={{ fontSize: 24 }}>👤</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#7c88a4', letterSpacing: .5, marginBottom: 2 }}>그룹 미해당 (오늘 가입 또는 정보 없음)</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>가입일 D+0 이거나 가입일 없는 회원</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#64748b' }}>{(data.groups.none?.length ?? 0).toLocaleString()}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>명</span></div>
          </div>
        )}

        {/* ── D+1~14 일자별 분포 (active 상태일 때) ── */}
        {data && viewMode === 'active' && curGroup !== 'none' && (
          <div style={{ background: 'white', borderRadius: 14, padding: '16px 20px', border: '1px solid #e2e8f4', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: '#374151' }}>
              📊 그룹 {curGroup} 일자별 현황 (D+1 ~ D+14)
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Array.from({ length: 14 }, (_, i) => i + 1).map(day => {
                const cnt = data.groups[curGroup].active.filter(m => m.day_num === day).length
                return (
                  <div key={day}
                    onClick={() => {
                      if (dayFilter === day) setDayFilter(null)  // 같은 거 누르면 해제
                      else setDayFilter(day)
                      setSearch('')
                    }}
                    style={{
                      textAlign: 'center', padding: '8px 10px', borderRadius: 8,
                      background: dayFilter === day ? dayColor(day) : cnt > 0 ? dayBg(day) : '#f8fafc',
                      border: `2px solid ${dayFilter === day ? dayColor(day) : cnt > 0 ? dayColor(day) + '40' : '#e2e8f4'}`,
                      minWidth: 48, cursor: cnt > 0 ? 'pointer' : 'default',
                      transition: 'all .15s',
                    }}>
                    <div style={{ fontSize: 10, color: dayFilter === day ? 'rgba(255,255,255,.8)' : '#94a3b8', fontWeight: 700 }}>D+{day}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: dayFilter === day ? 'white' : cnt > 0 ? dayColor(day) : '#d1d5db', lineHeight: 1.2 }}>{cnt}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 테이블 ── */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f4', overflow: 'hidden' }}>
          {/* 탭 + 컨트롤 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbff', flexWrap: 'wrap' }}>
            {/* 탭 */}
            <div style={{ display: 'flex', gap: 2 }}>
              {curGroup !== 'none' && (['active', 'unconverted'] as ViewMode[]).map(mode => {
                const meta = GROUP_META[curGroup as 'A'|'B'|'C']
                return (
                  <button key={mode} onClick={() => { setViewMode(mode); setSearch(''); setDayFilter(null) }}
                    style={{
                      padding: '7px 14px', border: 'none', borderRadius: 8,
                      background: viewMode === mode ? meta.bg : 'transparent',
                      color: viewMode === mode ? meta.color : '#7c88a4',
                      fontWeight: viewMode === mode ? 800 : 500, fontSize: 13,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                    }}>
                    {mode === 'active'
                      ? `🎯 D+1~14 발송대상 (${(data?.groups[curGroup as 'A'|'B'|'C'] as GroupData)?.active?.length ?? 0})`
                      : `⚠️ 14일 초과 미전환 (${(data?.groups[curGroup as 'A'|'B'|'C'] as GroupData)?.unconverted?.length ?? 0})`
                    }
                  </button>
                )
              })}
              {curGroup === 'none' && (
                <div style={{ padding: '7px 14px', fontSize: 13, color: '#64748b', fontWeight: 700 }}>
                  👤 그룹 미해당 회원 ({data?.groups.none?.length ?? 0}명)
                </div>
              )}
            </div>

            {/* 그룹 설명 */}
            <div style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>
              {curGroup === 'none' ? NONE_META.desc : viewMode === 'active' ? GROUP_META[curGroup as 'A'|'B'|'C'].desc : GROUP_META[curGroup as 'A'|'B'|'C'].unconvDesc}
            </div>

            {/* 검색 */}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94a3b8' }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="이메일, 이름 검색..."
                style={{ padding: '8px 12px 8px 30px', border: '1.5px solid #e2e8f4', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 200 }} />
            </div>

            {dayFilter !== null && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px', background: dayColor(dayFilter), color:'white', borderRadius:20, fontSize:13, fontWeight:800 }}>
                D+{dayFilter} 필터
                <button onClick={() => setDayFilter(null)} style={{background:'none',border:'none',color:'white',cursor:'pointer',fontSize:16,padding:0,lineHeight:1}}>×</button>
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', background: curMeta.bg, color: curMeta.color, borderRadius: 20 }}>
              {curList.length.toLocaleString()}명
            </span>
            <button onClick={downloadCurrent}
              style={{ padding: '8px 16px', border: '1.5px solid #e2e8f4', borderRadius: 8, background: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>
              ⬇ 엑셀
            </button>
          </div>

          {/* 테이블 */}
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>⏳ 로딩 중...</div>
            ) : curList.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                해당 조건의 대상자가 없습니다
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, zIndex: 5, background: '#f8fafc', borderBottom: '1.5px solid #e2e8f4' }}>
                    {['#', '이메일', '학부모명', '자녀이름', '전화번호', curMeta.refLabel, 'D+'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#7c88a4', letterSpacing: .5, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {curList.map((m, i) => (
                    <tr key={m.email} style={{ borderBottom: '1px solid #f3f6fb' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      <td style={{ padding: '10px 14px', color: '#d1d5db', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12.5 }}>{m.email}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13 }}>{m.parent_name ?? <span style={{ color: '#d1d5db' }}>—</span>}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13 }}>{m.child_name ?? <span style={{ color: '#d1d5db' }}>—</span>}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtPhone(m.phone) || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#7c88a4' }}>{fmtDate(getRefDate(m, curGroup))}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {m.day_num !== undefined ? (
                          <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: dayBg(m.day_num), color: dayColor(m.day_num) }}>
                            D+{m.day_num}
                          </span>
                        ) : (
                          <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: '#fee2e2', color: '#dc2626' }}>
                            +{Math.round((new Date().getTime() - new Date(getRefDate(m, curGroup)).getTime()) / 86400000)}일
                          </span>
                        )}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, padding: '14px 22px', borderRadius: 12,
          fontWeight: 600, fontSize: 14, color: 'white', zIndex: 2000,
          boxShadow: '0 8px 32px rgba(0,0,0,.2)',
          background: toast.type === 'ok' ? '#16a34a' : toast.type === 'err' ? '#dc2626' : '#4355e8',
          animation: 'fadeIn .2s ease', maxWidth: 500,
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </div>
  )
}
