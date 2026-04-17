'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import type { Campaign } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────
interface ParsedMember { email: string; category: string; marketing: boolean }
interface XlsxStats { total: number; paid: number; both: number; emailOnly: number; marketing: number }
interface SendLog { email: string; error?: string; created_at: string }
interface LogData { total: number; sent_count: number; fail_count: number; sent: SendLog[]; failed: SendLog[] }

const TABS = ['① 수신자 업로드', '② 메일 작성', '③ 수신자 선택', '④ 발송 확인', '📋 발송 이력']
const INTERNAL = new Set(['growv.com', 'growv.kr'])

// ─── Excel parsing (client-side) ─────────────────────────────────────────────
// 파일 1개의 모든 시트에서 이메일 추출
function parseOneFile(file: File): Promise<ParsedMember[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target!.result as ArrayBuffer, { type: 'array' })
        const members: ParsedMember[] = []
        const seen = new Set<string>()

        // 모든 시트 순회
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName]
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })
          if (!rows.length) continue

          const keys = Object.keys(rows[0])
          const eCol = keys.find(k => k === '이메일' || k === '로그인ID' || /email/i.test(k))
          const phCol = keys.find(k => k === '전화번호' || k === '휴대폰번호')
          const pdCol = keys.find(k => k === '결제여부')
          const mkCol = keys.find(k => /마케팅/.test(k))

          // 이메일 컬럼 없으면 모든 셀에서 이메일 패턴 탐색
          for (const row of rows) {
            let rawEmail = ''
            if (eCol) {
              rawEmail = String(row[eCol] ?? '').trim().toLowerCase()
            } else {
              // 컬럼명 없을 때: 모든 값에서 @ 포함된 것 찾기
              for (const val of Object.values(row)) {
                const s = String(val ?? '').trim().toLowerCase()
                if (s.includes('@') && s.includes('.')) { rawEmail = s; break }
              }
            }

            if (!rawEmail.includes('@')) continue
            const domain = rawEmail.split('@')[1] ?? ''
            if (INTERNAL.has(domain)) continue
            if (/^quvetest|^sv\d/.test(rawEmail)) continue
            if (seen.has(rawEmail)) continue
            seen.add(rawEmail)

            const hasPhone = !!phCol && !!row[phCol]
            const paid = pdCol ? row[pdCol] === 'Y' : false
            const marketing = mkCol ? (row[mkCol] === 'Y' || row[mkCol] === true) : false
            const category = paid ? '결제회원' : hasPhone ? '이메일+전화번호' : '이메일만'
            members.push({ email: rawEmail, category, marketing })
          }
        }
        resolve(members)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState(0)

  // 수신자 엑셀 (여러 파일)
  const [members, setMembers] = useState<ParsedMember[]>([])
  const [xlsxStats, setXlsxStats] = useState<XlsxStats | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<{name:string; count:number}[]>([])
  const [xlsxLoading, setXlsxLoading] = useState(false)

  // 메일 작성
  const [campaignTitle, setCampaignTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [htmlMode, setHtmlMode] = useState<'upload' | 'editor'>('upload')
  const [step2Preview, setStep2Preview] = useState(false)

  // 수신자 선택
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [mktOnly, setMktOnly] = useState(false)
  const [excludedEmails, setExcludedEmails] = useState<Set<string>>(new Set())
  const [listSearch, setListSearch] = useState('')
  const [extraEmailInput, setExtraEmailInput] = useState('')
  const [extraEmails, setExtraEmails] = useState<string[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)

  // 발송
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('10:00')
  const [sendResult, setSendResult] = useState<{ sentCount: number; failCount: number; remaining: number; hasPending: boolean; campaignId: string; isScheduled?: boolean; scheduledAt?: string } | null>(null)

  // 이력
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [historyDetail, setHistoryDetail] = useState<Campaign | null>(null)
  const [historyPreview, setHistoryPreview] = useState(false)
  const [historyLogs, setHistoryLogs] = useState<LogData | null>(null)
  const [logLoading, setLogLoading] = useState(false)
  const [historyTab, setHistoryTab] = useState<'preview' | 'sent' | 'failed'>('sent')
  const [continueCampaign, setContinueCampaign] = useState<Campaign | null>(null)

  const xlsxFileRef = useRef<HTMLInputElement>(null)
  const htmlFileRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)

  function showToast(msg: string, type: 'ok' | 'err' | 'info' = 'info') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  async function loadCampaigns() {
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(50)
    if (data) setCampaigns(data as Campaign[])
  }

  useEffect(() => { loadCampaigns() }, [])

  // 임시저장
  async function saveDraft() {
    if (!subject.trim() && !htmlContent.trim()) { showToast('제목 또는 내용을 입력해주세요.', 'err'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('campaigns').insert({
        title: campaignTitle || subject || '임시저장',
        subject: subject || '(제목 없음)',
        html_content: htmlContent,
        groups: selectedGroups,
        status: 'draft',
        total_count: 0,
        sent_count: 0,
        fail_count: 0,
        pending_emails: [],
      })
      if (error) throw error
      showToast('임시저장 완료! 발송 이력에서 확인하세요.', 'ok')
      await loadCampaigns()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '저장 오류', 'err')
    } finally { setSaving(false) }
  }

  async function loadLogs(campaignId: string) {
    setLogLoading(true); setHistoryLogs(null)
    try {
      const res = await fetch(`/api/send-logs?campaign_id=${campaignId}`)
      const json = await res.json()
      if (res.ok) setHistoryLogs(json)
    } finally { setLogLoading(false) }
  }

  // ── 수신자 엑셀 로드 (여러 파일 누적) ──
  async function handleXlsxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files; if (!files || !files.length) return
    setXlsxLoading(true)
    try {
      const newFiles: {name:string; count:number}[] = []
      let allNewMembers: ParsedMember[] = []

      for (const file of Array.from(files)) {
        const parsed = await parseOneFile(file)
        newFiles.push({ name: file.name, count: parsed.length })
        allNewMembers = [...allNewMembers, ...parsed]
      }

      // 기존 + 신규 합산 후 이메일 기준 중복 제거
      setMembers(prev => {
        const seenEmails = new Set(prev.map(m => m.email))
        const deduped = allNewMembers.filter(m => {
          if (seenEmails.has(m.email)) return false
          seenEmails.add(m.email)
          return true
        })
        const combined = [...prev, ...deduped]
        // 통계 업데이트
        const stats: XlsxStats = { total: combined.length, paid: 0, both: 0, emailOnly: 0, marketing: 0 }
        combined.forEach(m => {
          if (m.category === '결제회원') stats.paid++
          else if (m.category === '이메일+전화번호') stats.both++
          else stats.emailOnly++
          if (m.marketing) stats.marketing++
        })
        setXlsxStats(stats)
        return combined
      })
      setUploadedFiles(prev => [...prev, ...newFiles])
      const totalNew = allNewMembers.length
      showToast(`✅ ${newFiles.map(f=>f.name).join(', ')} — ${totalNew.toLocaleString()}명 추가 (중복 제외)`, 'ok')
    } catch (err: unknown) {
      showToast('파일 오류: ' + (err instanceof Error ? err.message : ''), 'err')
    } finally {
      setXlsxLoading(false)
      if (xlsxFileRef.current) xlsxFileRef.current.value = ''
    }
  }

  function removeUploadedFile(idx: number) {
    // 파일 제거 후 전체 재계산 불가 (이미 합산됨) → 전체 리셋
    setUploadedFiles(prev => {
      const next = prev.filter((_, i) => i !== idx)
      if (!next.length) { setMembers([]); setXlsxStats(null); setSelectedGroups([]); setMktOnly(false) }
      return next
    })
    showToast('전체 파일을 다시 업로드해주세요.', 'info')
  }

  function clearAllFiles() {
    setMembers([]); setXlsxStats(null); setUploadedFiles([])
    setSelectedGroups([]); setMktOnly(false)
  }

  // ── HTML 업로드 ──
  async function handleHtmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch('/api/upload-template', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setHtmlContent(json.html); showToast('HTML 로드 완료', 'ok')
    } catch (err: unknown) { showToast(err instanceof Error ? err.message : '오류', 'err') }
    finally { if (htmlFileRef.current) htmlFileRef.current.value = '' }
  }

  // ── 수신자 계산 ──
  function getRecipientEmails(): string[] {
    const fromGroups = members
      .filter(m => selectedGroups.includes(m.category))
      .filter(m => !mktOnly || m.marketing)
      .filter(m => !excludedEmails.has(m.email))
      .map(m => m.email)
    const filteredExtra = extraEmails.filter(e => !excludedEmails.has(e))
    return Array.from(new Set([...fromGroups, ...filteredExtra]))
  }

  function excludeEmail(email: string) {
    setExcludedEmails(prev => new Set(Array.from(prev).concat(email)))
  }

  function restoreEmail(email: string) {
    setExcludedEmails(prev => { const next = new Set(prev); next.delete(email); return next })
  }

  function excludeAll() {
    const allVisible = getFilteredListEmails()
    setExcludedEmails(prev => new Set(Array.from(prev).concat(allVisible)))
  }

  function getFilteredListEmails(): string[] {
    const q = listSearch.trim().toLowerCase()
    return members
      .filter(m => selectedGroups.includes(m.category))
      .filter(m => !mktOnly || m.marketing)
      .map(m => m.email)
      .concat(extraEmails)
      .filter(e => !q || e.includes(q))
  }

  // ── 수기 이메일 추가 ──
  function addExtraEmail() {
    const list = extraEmailInput.trim().toLowerCase().split(/[\s,;\n]+/).filter(e => e.includes('@'))
    const newOnes = list.filter(e => !extraEmails.includes(e))
    if (!newOnes.length) { showToast('유효한 이메일이 없거나 이미 추가됨', 'err'); return }
    setExtraEmails(prev => [...prev, ...newOnes]); setExtraEmailInput('')
    showToast(`${newOnes.length}개 추가됨`, 'ok')
  }

  // ── 발송 ──
  async function handleSend(campaignId?: string, isContinue = false) {
    if (!isContinue) {
      if (!subject.trim()) { showToast('메일 제목을 입력해주세요.', 'err'); return }
      if (!htmlContent.trim()) { showToast('메일 내용을 입력해주세요.', 'err'); return }
      const emails = getRecipientEmails()
      if (emails.length === 0) { showToast('수신자를 선택해주세요.', 'err'); return }
    }
    setSending(true); setSendResult(null)
    try {
      let cid = campaignId
      if (!isContinue) {
        const emails = getRecipientEmails()
        // 예약 발송이면 scheduled_at 계산
        let scheduledAtStr: string | null = null
        if (sendMode === 'scheduled' && scheduledDate) {
          scheduledAtStr = new Date(`${scheduledDate}T${scheduledTime}:00+09:00`).toISOString()
        }

        const { data: campaign, error } = await supabase
          .from('campaigns')
          .insert({
            title: campaignTitle || subject,
            subject,
            html_content: htmlContent,
            groups: selectedGroups,
            scheduled_at: scheduledAtStr,
            // 예약 발송이면 pending_emails 미리 저장
            ...(scheduledAtStr && {
              status: 'scheduled',
              pending_emails: emails,
              total_count: emails.length,
            }),
          })
          .select().single()
        if (error || !campaign) throw new Error('캠페인 생성 실패: ' + error?.message)
        cid = campaign.id

        // 예약 발송이면 여기서 종료
        if (scheduledAtStr) {
          setSendResult({ sentCount: 0, failCount: 0, remaining: emails.length, hasPending: false, campaignId: cid!, isScheduled: true, scheduledAt: scheduledAtStr })
          showToast(`📅 ${new Date(scheduledAtStr).toLocaleString('ko-KR')} 발송 예약 완료! (${emails.length}명)`, 'ok')
          await loadCampaigns()
          return
        }

        const res = await fetch('/api/send-campaign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: cid, recipientEmails: emails, isContinue: false }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setSendResult({ ...json, campaignId: cid })
        json.hasPending
          ? showToast(`오늘 ${json.sentCount}건 발송 완료! ${json.remaining}명 대기 중`, 'info')
          : showToast(`전체 발송 완료! ${json.sentCount}건 성공`, 'ok')
      } else {
        const res = await fetch('/api/send-campaign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: cid, isContinue: true }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setSendResult({ ...json, campaignId: cid! })
        json.hasPending
          ? showToast(`오늘 ${json.sentCount}건 발송 완료! ${json.remaining}명 대기 중`, 'info')
          : showToast(`전체 발송 완료! ${json.sentCount}건 성공`, 'ok')
      }
      await loadCampaigns()
    } catch (err: unknown) { showToast(err instanceof Error ? err.message : '오류', 'err') }
    finally { setSending(false) }
  }

  function resetAll() {
    setCampaignTitle(''); setSubject(''); setHtmlContent('')
    setSelectedGroups([]); setMktOnly(false)
    setExcludedEmails(new Set()); setListSearch('')
    setExtraEmails([]); setExtraEmailInput('')
    setSendResult(null); setTab(0)
  }

  const recipientEmails = getRecipientEmails()

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f9' }}>

      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg,#3d4fd7,#5b6ef5)', padding: '18px 36px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 3px 20px rgba(61,79,215,.3)' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: -1 }}>
          i<span style={{ color: '#a8b4ff' }}>Q</span>uve <span style={{ fontWeight: 400, opacity: .7, fontSize: 18 }}>메일 발송</span>
        </div>
        {xlsxStats && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, fontSize: 13, color: 'rgba(255,255,255,.8)' }}>
            <span>파일 <b style={{ color: 'white' }}>{uploadedFiles.length}</b>개</span>
            <span>수신자 <b style={{ color: 'white', fontSize: 15 }}>{xlsxStats.total.toLocaleString()}</b>명</span>
            <span>💳 <b style={{ color: 'white' }}>{xlsxStats.paid}</b></span>
            <span>📋 <b style={{ color: 'white' }}>{xlsxStats.both}</b></span>
            <span>✉️ <b style={{ color: 'white' }}>{xlsxStats.emailOnly}</b></span>
          </div>
        )}
      </header>

      {/* Tabs */}
      <nav style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 36px', display: 'flex', overflowX: 'auto' }}>
        {TABS.map((label, i) => (
          <button key={i} onClick={() => { setTab(i); if (i === 4) loadCampaigns() }}
            style={{ padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === i ? 700 : 400, whiteSpace: 'nowrap', color: tab === i ? '#3d4fd7' : '#64748b', borderBottom: tab === i ? '2.5px solid #3d4fd7' : '2.5px solid transparent', transition: 'all .15s' }}>
            {label}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 860, margin: '32px auto', padding: '0 24px' }}>

        {/* ══ Tab 0: 수신자 업로드 ══ */}
        {tab === 0 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>수신자 엑셀 업로드</h2>
            <p style={{ color: '#64748b', marginBottom: 20, fontSize: 14, lineHeight: 1.8 }}>
              파일을 여러 개 올려도 돼요 — 이메일 주소를 자동으로 취합하고 중복은 제거됩니다.<br />
              모든 시트를 스캔하고 <b>@growv.com / @growv.kr</b> 내부 계정은 자동 제외됩니다.
            </p>

            {/* 드롭존 */}
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: '3px dashed #a5b4fc', borderRadius: 16, padding: '36px 24px',
              cursor: xlsxLoading ? 'not-allowed' : 'pointer',
              background: '#f5f7ff', transition: 'all .18s', marginBottom: 16,
              opacity: xlsxLoading ? .6 : 1,
            }}>
              <input ref={xlsxFileRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }}
                onChange={handleXlsxUpload} disabled={xlsxLoading} />
              <div style={{ fontSize: 44, marginBottom: 10 }}>{xlsxLoading ? '⏳' : '📂'}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#4355e8', marginBottom: 4 }}>
                {xlsxLoading ? '파일 처리 중...' : '파일 클릭 또는 드래그'}
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>여러 파일 동시 선택 가능 · 추가 업로드 시 누적됩니다</div>
            </label>

            {/* 업로드된 파일 목록 */}
            {uploadedFiles.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>업로드된 파일 ({uploadedFiles.length}개)</div>
                  <button onClick={clearAllFiles}
                    style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '2px 8px' }}>
                    전체 삭제
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {uploadedFiles.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: 18 }}>📄</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{f.count.toLocaleString()}행</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 통계 카드 */}
            {xlsxStats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
                {[
                  { label: '전체 (중복제외)', value: xlsxStats.total, color: '#64748b' },
                  { label: '💳 결제회원', value: xlsxStats.paid, color: '#16a34a' },
                  { label: '📋 이메일+전화', value: xlsxStats.both, color: '#d97706' },
                  { label: '✉️ 이메일만', value: xlsxStats.emailOnly, color: '#7c3aed' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ textAlign: 'right' }}>
              <button onClick={() => setTab(1)}
                disabled={!xlsxStats}
                style={{ padding: '11px 28px', background: xlsxStats ? '#3d4fd7' : '#94a3b8', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: xlsxStats ? 'pointer' : 'not-allowed' }}>
                다음: 메일 작성 →
              </button>
            </div>
          </div>
        )}

        {/* ══ Tab 1: 메일 작성 ══ */}
        {tab === 1 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>메일 작성</h2>

            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>캠페인 이름 (내부용)</div>
            <input value={campaignTitle} onChange={e => setCampaignTitle(e.target.value)} placeholder="예: 4월 뉴스레터"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 16, background: 'white' }} />

            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>메일 제목 *</div>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="예: 아이큐브에서 드리는 특별한 소식 🎉"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 20, background: 'white' }} />

            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>메일 본문 (HTML)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['upload', 'editor'] as const).map(m => (
                <button key={m} onClick={() => setHtmlMode(m)}
                  style={{ padding: '8px 16px', border: `1.5px solid ${htmlMode === m ? '#3d4fd7' : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, fontWeight: htmlMode === m ? 700 : 400, background: htmlMode === m ? '#eff2ff' : 'white', color: htmlMode === m ? '#3d4fd7' : '#64748b', cursor: 'pointer' }}>
                  {m === 'upload' ? '📁 HTML 파일 업로드' : '✏️ 직접 입력'}
                </button>
              ))}
            </div>

            {htmlMode === 'upload' ? (
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #c7d2fe', borderRadius: 14, padding: '24px', cursor: 'pointer', background: '#f8faff', gap: 6 }}>
                <input ref={htmlFileRef} type="file" accept=".html,.htm" style={{ display: 'none' }} onChange={handleHtmlUpload} />
                <div style={{ fontSize: 28 }}>🌐</div>
                <div style={{ fontSize: 14, color: '#6366f1', fontWeight: 600 }}>HTML 파일 드롭 또는 클릭 (최대 5MB)</div>
              </label>
            ) : (
              <textarea value={htmlContent} onChange={e => setHtmlContent(e.target.value)} placeholder="<html>...</html>"
                style={{ width: '100%', minHeight: 280, padding: '14px 16px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', outline: 'none', background: '#f8fafc', lineHeight: 1.6 }} />
            )}

            {htmlContent && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#15803d' }}>
                  ✅ HTML 로드됨 ({(htmlContent.length / 1024).toFixed(1)} KB)
                </div>
                <button onClick={() => setStep2Preview(true)}
                  style={{ padding: '10px 18px', background: '#eff2ff', color: '#3d4fd7', border: '1.5px solid #c7d2fe', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  🔍 미리보기
                </button>
              </div>
            )}

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setTab(0)}>← 이전</Btn>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveDraft} disabled={saving}
                  style={{ padding: '10px 20px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', background: 'white', color: '#374151', opacity: saving ? .6 : 1, fontFamily: 'inherit' }}>
                  {saving ? '저장 중...' : '💾 임시저장'}
                </button>
                <Btn primary onClick={() => {
                  if (!subject.trim()) { showToast('메일 제목을 입력해주세요.', 'err'); return }
                  if (!htmlContent.trim()) { showToast('메일 내용을 입력해주세요.', 'err'); return }
                  setTab(2)
                }}>다음: 수신자 선택 →</Btn>
              </div>
            </div>
          </div>
        )}

        {/* ══ Tab 2: 수신자 선택 ══ */}
        {tab === 2 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>수신자 선택</h2>

            {/* 그룹 선택 */}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>발송 그룹 선택</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
              {[
                { key: '결제회원', label: '💳 결제회원', count: xlsxStats?.paid ?? 0, color: '#16a34a', bg: '#dcfce7' },
                { key: '이메일+전화번호', label: '📋 이메일+전화', count: xlsxStats?.both ?? 0, color: '#d97706', bg: '#fef3c7' },
                { key: '이메일만', label: '✉️ 이메일만', count: xlsxStats?.emailOnly ?? 0, color: '#7c3aed', bg: '#ede9fe' },
              ].map(g => {
                const active = selectedGroups.includes(g.key)
                return (
                  <button key={g.key}
                    onClick={() => { setSelectedGroups(prev => prev.includes(g.key) ? prev.filter(x => x !== g.key) : [...prev, g.key]); setExcludedEmails(new Set()); setListSearch('') }}
                    style={{ padding: '16px', border: `2px solid ${active ? g.color : '#e2e8f0'}`, borderRadius: 12, background: active ? g.bg : 'white', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? g.color : '#374151', marginBottom: 4 }}>{g.label}</div>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>{g.count.toLocaleString()}명</div>
                    {active && <div style={{ fontSize: 11, color: g.color, marginTop: 4, fontWeight: 700 }}>✓ 선택됨</div>}
                  </button>
                )
              })}
            </div>

            {/* 마케팅 동의 토글 */}
            {selectedGroups.length > 0 && (
              <button onClick={() => { setMktOnly(p => !p); setExcludedEmails(new Set()) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', border: `1.5px solid ${mktOnly ? '#0891b2' : '#e2e8f0'}`, borderRadius: 10, background: mktOnly ? '#ecfeff' : 'white', color: mktOnly ? '#0e7490' : '#64748b', fontSize: 13, fontWeight: mktOnly ? 700 : 500, cursor: 'pointer', marginBottom: 12, transition: 'all .15s', fontFamily: 'inherit' }}>
                <span style={{ fontSize: 16 }}>📢</span>
                마케팅 동의한 회원만
                {mktOnly && <span style={{ marginLeft: 4, background: '#0891b2', color: 'white', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>ON</span>}
              </button>
            )}

            {/* ── 수신자 명단 테이블 ── */}
            {(selectedGroups.length > 0 || extraEmails.length > 0) && (() => {
              const allList = members
                .filter(m => selectedGroups.includes(m.category))
                .filter(m => !mktOnly || m.marketing)
                .map(m => ({ email: m.email, src: '파일', category: m.category }))
                .concat(extraEmails.map(e => ({ email: e, src: '수기', category: '수기추가' })))

              const q = listSearch.trim().toLowerCase()
              const visibleList = allList.filter(m => !q || m.email.includes(q))
              const excludedCount = excludedEmails.size

              return (
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 14, overflow: 'hidden' }}>
                  {/* 테이블 헤더 컨트롤 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbff' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                      발송 명단
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#3d4fd7', fontWeight: 800 }}>
                        {(allList.length - excludedCount).toLocaleString()}명
                      </span>
                      {excludedCount > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
                          ({excludedCount}명 제외됨)
                        </span>
                      )}
                    </div>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#94a3b8' }}>🔍</span>
                      <input value={listSearch} onChange={e => setListSearch(e.target.value)}
                        placeholder="이메일 검색..."
                        style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                    {excludedCount > 0 && (
                      <button onClick={() => setExcludedEmails(new Set())}
                        style={{ padding: '7px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}>
                        제외 취소 ({excludedCount})
                      </button>
                    )}
                  </div>

                  {/* 명단 스크롤 테이블 */}
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                          <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.5px', borderBottom: '1px solid #f1f5f9' }}>#</th>
                          <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.5px', borderBottom: '1px solid #f1f5f9' }}>이메일</th>
                          <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.5px', borderBottom: '1px solid #f1f5f9' }}>구분</th>
                          <th style={{ padding: '9px 14px', textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.5px', borderBottom: '1px solid #f1f5f9' }}>제외</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleList.length === 0 ? (
                          <tr><td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>검색 결과가 없습니다</td></tr>
                        ) : visibleList.map((m, i) => {
                          const isExcluded = excludedEmails.has(m.email)
                          const catColor: Record<string, string> = { '결제회원': '#16a34a', '이메일+전화번호': '#d97706', '이메일만': '#7c3aed', '수기추가': '#3d4fd7' }
                          const catBg: Record<string, string> = { '결제회원': '#dcfce7', '이메일+전화번호': '#fef3c7', '이메일만': '#ede9fe', '수기추가': '#eff2ff' }
                          return (
                            <tr key={m.email} style={{ borderBottom: '1px solid #f8fafc', background: isExcluded ? '#fef2f2' : 'white', opacity: isExcluded ? .55 : 1 }}>
                              <td style={{ padding: '9px 14px', color: '#d1d5db', fontSize: 12 }}>{i + 1}</td>
                              <td style={{ padding: '9px 14px', fontSize: 12.5, textDecoration: isExcluded ? 'line-through' : 'none', color: isExcluded ? '#94a3b8' : '#1e293b' }}>{m.email}</td>
                              <td style={{ padding: '9px 14px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: catBg[m.category] ?? '#f1f5f9', color: catColor[m.category] ?? '#64748b' }}>
                                  {m.category === '이메일+전화번호' ? '📋 이메일+전화' : m.category === '결제회원' ? '💳 결제' : m.category === '이메일만' ? '✉️ 이메일만' : '✏️ 수기'}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                                {isExcluded ? (
                                  <button onClick={() => restoreEmail(m.email)}
                                    style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>복원</button>
                                ) : (
                                  <button onClick={() => excludeEmail(m.email)}
                                    style={{ padding: '4px 10px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fef2f2', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#dc2626' }}>제외</button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 하단 요약 */}
                  <div style={{ padding: '10px 16px', background: '#fafbff', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      전체 {allList.length.toLocaleString()}명 중 {excludedCount > 0 ? <><span style={{ color: '#dc2626', fontWeight: 700 }}>{excludedCount}명 제외</span> → </> : ''}<b style={{ color: '#3d4fd7' }}>{(allList.length - excludedCount).toLocaleString()}명 발송 예정</b>
                    </span>
                    {excludedCount === 0 && visibleList.length > 0 && (
                      <button onClick={() => setExcludedEmails(new Set(visibleList.map(m => m.email)))}
                        style={{ padding: '5px 12px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fef2f2', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#dc2626' }}>
                        검색된 {visibleList.length}명 전체 제외
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* 수기 이메일 추가 */}
            <div style={{ background: 'white', borderRadius: 14, padding: '18px 20px', border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>수기 이메일 추가</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>쉼표·줄바꿈으로 여러 개 한번에 입력 가능</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea value={extraEmailInput} onChange={e => setExtraEmailInput(e.target.value)}
                  placeholder={'email1@example.com\nemail2@example.com'}
                  style={{ flex: 1, padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minHeight: 64, resize: 'vertical', outline: 'none' }} />
                <button onClick={addExtraEmail}
                  style={{ padding: '0 18px', background: '#3d4fd7', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'stretch' }}>추가</button>
              </div>
            </div>

            {/* 최종 발송 수 */}
            {recipientEmails.length > 0 && (
              <div style={{ padding: '14px 18px', background: '#eff2ff', border: '1px solid #c7d2fe', borderRadius: 10, fontSize: 14, color: '#3d4fd7', fontWeight: 600, marginBottom: 14 }}>
                📬 총 <span style={{ fontSize: 22, fontWeight: 900 }}>{recipientEmails.length.toLocaleString()}</span>명에게 발송됩니다
                {excludedEmails.size > 0 && <span style={{ fontSize: 12, marginLeft: 8, color: '#dc2626', fontWeight: 700 }}>({excludedEmails.size}명 제외됨)</span>}
                {mktOnly && <span style={{ fontSize: 12, marginLeft: 8, opacity: .8 }}>(마케팅 동의자만)</span>}
                {extraEmails.length > 0 && <span style={{ fontSize: 12, marginLeft: 8, opacity: .8 }}>(수기 {extraEmails.length}명 포함)</span>}
              </div>
            )}

            <button onClick={() => setPreviewOpen(true)}
              style={{ width: '100%', padding: '11px', border: '1.5px dashed #3d4fd7', borderRadius: 10, background: 'transparent', cursor: 'pointer', color: '#3d4fd7', fontWeight: 700, fontSize: 14, marginBottom: 24 }}>
              🔍 메일 미리보기
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setTab(1)}>← 이전</Btn>
              <Btn primary onClick={() => {
                if (recipientEmails.length === 0) { showToast('수신자를 선택해주세요.', 'err'); return }
                setTab(3)
              }}>다음: 발송 확인 →</Btn>
            </div>
          </div>
        )}

        {/* ══ Tab 3: 발송 확인 ══ */}
        {tab === 3 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>발송 확인</h2>
            <div style={{ background: 'white', borderRadius: 16, padding: '24px', border: '1px solid #e2e8f0', marginBottom: 24 }}>
              {[
                { label: '캠페인 이름', value: campaignTitle || subject },
                { label: '메일 제목', value: subject },
                { label: '수신자 파일', value: uploadedFiles.length > 0 ? uploadedFiles.map(f=>f.name).join(', ') : '—' },
                { label: '발송 그룹', value: selectedGroups.join(', ') || '(수기만)' },
                { label: '마케팅 동의만', value: mktOnly ? 'Y' : 'N' },
                { label: '총 수신자', value: `${recipientEmails.length.toLocaleString()}명` },
                { label: '발신자', value: '아이큐브 <iquve@growv.com>' },
                { label: 'HTML 크기', value: `${(htmlContent.length / 1024).toFixed(1)} KB` },
                { label: '배치 발송', value: '30건씩 · 2초 간격 (스팸 방지)' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', gap: 16, padding: '11px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ width: 130, fontSize: 13, color: '#94a3b8', flexShrink: 0 }}>{r.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.value}</div>
                </div>
              ))}
            </div>

            {!sendResult ? (
              <div>
                {/* 발송 모드 선택 */}
                <div style={{ background: '#f8fafc', borderRadius: 14, padding: '20px', border: '1px solid #e2e8f0', marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>발송 방법 선택</div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    {[{ key: 'now', label: '🚀 즉시 발송' }, { key: 'scheduled', label: '📅 예약 발송' }].map(m => (
                      <button key={m.key} onClick={() => setSendMode(m.key as 'now' | 'scheduled')}
                        style={{ flex: 1, padding: '12px', border: `2px solid ${sendMode === m.key ? '#3d4fd7' : '#e2e8f0'}`, borderRadius: 10, background: sendMode === m.key ? '#eff2ff' : 'white', color: sendMode === m.key ? '#3d4fd7' : '#374151', fontWeight: sendMode === m.key ? 800 : 400, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {sendMode === 'scheduled' && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px', background: 'white', borderRadius: 10, border: '1px solid #c7d2fe' }}>
                      <span style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>📅 발송 날짜</span>
                      <input type="date" value={scheduledDate}
                        min={new Date().toISOString().slice(0,10)}
                        onChange={e => setScheduledDate(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                      <span style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>⏰ 시간 (KST)</span>
                      <input type="time" value={scheduledTime}
                        onChange={e => setScheduledTime(e.target.value)}
                        style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', width: 120 }} />
                    </div>
                  )}
                  {sendMode === 'scheduled' && !scheduledDate && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#f59e0b' }}>⚠️ 발송 날짜를 선택해주세요</div>
                  )}
                </div>

                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => {
                      if (sendMode === 'scheduled' && !scheduledDate) { showToast('발송 날짜를 선택해주세요.', 'err'); return }
                      handleSend()
                    }}
                    disabled={sending || (sendMode === 'scheduled' && !scheduledDate)}
                    style={{ padding: '16px 52px', background: sending ? '#94a3b8' : sendMode === 'scheduled' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#e84393,#f472b6)', color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 900, cursor: (sending || (sendMode === 'scheduled' && !scheduledDate)) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10, boxShadow: sending ? 'none' : '0 4px 20px rgba(99,102,241,.4)' }}>
                    {sending ? <><Spinner /> 처리 중...</> : sendMode === 'scheduled' ? `📅 ${scheduledDate ? scheduledDate + ' ' + scheduledTime + ' 발송 예약' : '예약 발송 설정'}` : '🚀 메일 발송 시작'}
                  </button>
                  <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>
                    {sendMode === 'now' ? '발송 후 취소할 수 없습니다.' : '예약 후 발송 이력에서 취소 가능합니다.'}
                  </p>
                </div>
              </div>

            ) : sendResult.isScheduled ? (
              <div style={{ padding: '32px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📅</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#3d4fd7', marginBottom: 8 }}>예약 완료!</div>
                <div style={{ fontSize: 15, color: '#3730a3', lineHeight: 1.8 }}>
                  <b>{new Date(sendResult.scheduledAt!).toLocaleString('ko-KR')}</b>에<br />
                  <b>{sendResult.remaining.toLocaleString()}명</b>에게 자동 발송됩니다.<br />
                  <span style={{ fontSize: 13, opacity: .7 }}>하루 100명씩 자동으로 이어서 발송됩니다.</span>
                </div>
              </div>
            ) : (
              <div style={{ padding: '32px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#15803d', marginBottom: 8 }}>전체 발송 완료!</div>
                <div style={{ fontSize: 15, color: '#166534' }}>
                  <b>{sendResult.sentCount.toLocaleString()}명</b> 성공
                  {sendResult.failCount > 0 && <span style={{ color: '#dc2626' }}>, {sendResult.failCount}명 실패</span>}
                </div>
              </div>
            )}

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setTab(2)}>← 이전</Btn>
              {sendResult && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={() => { setTab(4); loadCampaigns() }}>발송 이력 보기</Btn>
                  <Btn primary onClick={resetAll}>새 캠페인 만들기</Btn>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ Tab 4: 발송 이력 ══ */}
        {tab === 4 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>발송 이력</h2>
              <button onClick={loadCampaigns} style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: 'white', fontSize: 13, cursor: 'pointer', color: '#64748b' }}>🔄 새로고침</button>
            </div>
            {campaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>발송 이력이 없습니다.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {campaigns.map(c => (
                  <div key={c.id} onClick={() => { setHistoryDetail(c); setHistoryPreview(false); setHistoryTab('sent'); loadLogs(c.id) }}
                    style={{ background: 'white', borderRadius: 14, padding: '18px 22px', border: '1px solid #e2e8f0', borderLeft: `4px solid ${c.status === 'done' ? '#22c55e' : c.status === 'pending' ? '#f59e0b' : c.status === 'error' ? '#ef4444' : '#e2e8f0'}`, cursor: 'pointer', transition: 'box-shadow .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.1)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <StatusBadge status={c.status} />
                          <span style={{ fontSize: 15, fontWeight: 800 }}>{c.title}</span>
                          {(c.status === 'pending' || c.status === 'error') && (c.pending_emails?.length ?? 0) > 0 && (
                            <span onClick={e => { e.stopPropagation(); setContinueCampaign(c) }}
                              style={{ padding: '3px 10px', background: c.status === 'error' ? '#dc2626' : '#f59e0b', color: 'white', borderRadius: 20, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                              {c.status === 'error' ? '⚠️ 오류 — 이어서 발송' : '▶ 이어서 발송'} ({c.pending_emails!.length.toLocaleString()}명 남음)
                            </span>
                          )}
                          {c.status === 'scheduled' && (
                            <span onClick={async e => {
                              e.stopPropagation()
                              if (!confirm('예약을 취소하시겠습니까?')) return
                              await supabase.from('campaigns').update({ status: 'draft', scheduled_at: null, pending_emails: [] }).eq('id', c.id)
                              showToast('예약이 취소되었습니다.', 'ok')
                              loadCampaigns()
                            }}
                              style={{ padding: '3px 10px', background: '#dc2626', color: 'white', borderRadius: 20, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                              ✕ 예약 취소
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>제목: {c.subject}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                          <Tag bg="#eff2ff">📮 {c.groups.join(', ') || '수기 발송'}</Tag>
                          <Tag bg="#f0fdf4">✅ {c.sent_count.toLocaleString()}명 성공</Tag>
                          {c.fail_count > 0 && <Tag bg="#fef2f2">❌ {c.fail_count}명 실패</Tag>}
                          <Tag bg="#f8fafc">👥 총 {c.total_count.toLocaleString()}명</Tag>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right', flexShrink: 0 }}>
                        <div>{c.scheduled_at && !c.sent_at ? `예약: ${new Date(c.scheduled_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : new Date(c.sent_at ?? c.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                        <div style={{ marginTop: 6, color: '#3d4fd7', fontWeight: 700 }}>내용 보기 →</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── 미리보기 모달 (메일 작성) ── */}
      {step2Preview && <PreviewModal subject={subject} html={htmlContent} onClose={() => setStep2Preview(false)} />}
      {previewOpen && <PreviewModal subject={subject} html={htmlContent} onClose={() => setPreviewOpen(false)} />}

      {/* ── 발송 이력 상세 모달 ── */}
      {historyDetail && (
        <div onClick={() => setHistoryDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.3)' }}>

            {/* 헤더 */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <StatusBadge status={historyDetail.status} />
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{historyDetail.title}</span>
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>제목: {historyDetail.subject} · {new Date(historyDetail.sent_at ?? historyDetail.created_at).toLocaleString('ko-KR')}</div>
              </div>
              <button onClick={() => setHistoryDetail(null)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 20, color: '#64748b' }}>×</button>
            </div>

            {/* 요약 통계 */}
            <div style={{ padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>👥 총 {historyDetail.total_count.toLocaleString()}명</span>
              <span style={{ fontSize: 13, color: '#15803d', fontWeight: 700 }}>✅ 성공 {historyLogs?.sent_count ?? historyDetail.sent_count}명</span>
              {(historyLogs?.fail_count ?? historyDetail.fail_count) > 0 && (
                <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>❌ 실패 {historyLogs?.fail_count ?? historyDetail.fail_count}명</span>
              )}
              {(historyLogs?.fail_count ?? 0) > 0 && (
                <button
                  onClick={() => {
                    // 실패자 이메일을 수기 이메일로 복사해서 새 캠페인 준비
                    const failEmails = historyLogs!.failed.map(l => l.email)
                    setExtraEmails(failEmails)
                    setHistoryDetail(null)
                    setTab(2)
                    showToast(`실패한 ${failEmails.length}명이 수기 이메일에 추가됐어요. 메일 작성 후 발송하세요.`, 'info')
                  }}
                  style={{ padding: '4px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 20, fontSize: 12, fontWeight: 700, color: '#dc2626', cursor: 'pointer', fontFamily: 'inherit' }}>
                  🔄 실패자 재발송 준비
                </button>
              )}
            </div>

            {/* 탭 */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
              {[
                { key: 'sent' as const,    label: `✅ 성공 명단 (${historyLogs?.sent_count ?? '…'})` },
                { key: 'failed' as const,  label: `❌ 실패 명단 (${historyLogs?.fail_count ?? '…'})` },
                { key: 'preview' as const, label: '📧 메일 내용' },
              ].map(t => (
                <button key={t.key} onClick={() => setHistoryTab(t.key)}
                  style={{ padding: '11px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: historyTab === t.key ? 800 : 400, color: historyTab === t.key ? '#3d4fd7' : '#64748b', borderBottom: historyTab === t.key ? '2.5px solid #3d4fd7' : '2.5px solid transparent', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* 탭 내용 */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {historyTab === 'preview' ? (
                <iframe srcDoc={historyDetail.html_content} style={{ width: '100%', height: '100%', minHeight: 480, border: 'none' }} sandbox="allow-same-origin" />
              ) : logLoading ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>⏳ 로딩 중...</div>
              ) : !historyLogs ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>발송 로그를 불러올 수 없습니다.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>#</th>
                      <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>이메일</th>
                      {historyTab === 'failed' && <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>오류 내용</th>}
                      <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>발송 시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(historyTab === 'sent' ? historyLogs.sent : historyLogs.failed).length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                        {historyTab === 'sent' ? '성공한 발송이 없습니다' : '실패한 발송이 없습니다 🎉'}
                      </td></tr>
                    ) : (historyTab === 'sent' ? historyLogs.sent : historyLogs.failed).map((log, i) => (
                      <tr key={log.email} style={{ borderBottom: '1px solid #f3f6fb' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                        <td style={{ padding: '10px 20px', color: '#d1d5db', fontSize: 12 }}>{i + 1}</td>
                        <td style={{ padding: '10px 20px', fontSize: 12.5 }}>{log.email}</td>
                        {historyTab === 'failed' && <td style={{ padding: '10px 20px', fontSize: 12, color: '#dc2626', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(log as SendLog).error ?? '—'}</td>}
                        <td style={{ padding: '10px 20px', fontSize: 12, color: '#94a3b8' }}>{new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 이어서 발송 모달 ── */}
      {continueCampaign && (
        <div onClick={() => setContinueCampaign(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 18, padding: '36px', maxWidth: 440, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,.25)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{continueCampaign.title}</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24, lineHeight: 1.8 }}>
              {continueCampaign.status === 'error' && (
                <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                  ⚠️ 이전 발송 중 오류가 발생했습니다.<br />발송되지 않은 회원부터 이어서 발송합니다.
                </div>
              )}
              남은 수신자 <b style={{ color: continueCampaign.status === 'error' ? '#dc2626' : '#d97706' }}>{(continueCampaign.pending_emails?.length ?? 0).toLocaleString()}명</b> 중<br />
              오늘 최대 <b>100명</b>을 발송합니다.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Btn onClick={() => setContinueCampaign(null)}>취소</Btn>
              <button onClick={async () => { const cid = continueCampaign.id; setContinueCampaign(null); setTab(3); setSendResult(null); await handleSend(cid, true) }}
                disabled={sending}
                style={{ padding: '10px 28px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {sending ? <><Spinner /> 발송 중...</> : '▶ 이어서 발송'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, padding: '14px 22px', borderRadius: 12, fontWeight: 600, fontSize: 14, color: 'white', zIndex: 2000, boxShadow: '0 8px 32px rgba(0,0,0,.2)', background: toast.type === 'ok' ? '#16a34a' : toast.type === 'err' ? '#dc2626' : '#3d4fd7', animation: 'fadeIn .2s ease' }}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </div>
  )
}

// ─── Sub Components ───────────────────────────────────────────────────────────
function PreviewModal({ subject, html, onClose }: { subject: string; html: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 740, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>미리보기</div><div style={{ fontWeight: 700, fontSize: 15 }}>{subject || '(제목 없음)'}</div></div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 20, color: '#64748b' }}>×</button>
        </div>
        <div style={{ padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' }}>
          <b>보낸 사람:</b> 아이큐브 &lt;iquve@growv.com&gt;&nbsp;&nbsp;<b>제목:</b> {subject}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <iframe srcDoc={html || '<p style="padding:20px;color:#888">내용 없음</p>'} style={{ width: '100%', height: '100%', minHeight: 520, border: 'none' }} sandbox="allow-same-origin" />
        </div>
      </div>
    </div>
  )
}

function Btn({ children, primary, onClick, disabled }: { children: React.ReactNode; primary?: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '10px 24px', border: primary ? 'none' : '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', background: primary ? '#3d4fd7' : 'white', color: primary ? 'white' : '#374151', opacity: disabled ? .5 : 1 }}>
      {children}
    </button>
  )
}

function Tag({ children, bg }: { children: React.ReactNode; bg: string }) {
  return <span style={{ padding: '3px 10px', background: bg, borderRadius: 20, fontSize: 12, color: '#374151' }}>{children}</span>
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const map: Record<string, [string, string, string]> = {
    draft:     ['임시저장', '#f1f5f9', '#64748b'],
    sending:   ['발송 중',  '#fef9c3', '#a16207'],
    done:      ['완료',    '#dcfce7', '#15803d'],
    error:     ['오류',    '#fee2e2', '#dc2626'],
    pending:   ['대기 중', '#fef3c7', '#d97706'],
    scheduled: ['예약됨',  '#eef2ff', '#3d4fd7'],
  }
  const [label, bg, color] = map[status] ?? map.draft
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color }}>{label}</span>
}

function Spinner() {
  return <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
}
