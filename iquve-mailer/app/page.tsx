'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import type { Campaign } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────
interface ParsedMember { email: string; category: string; marketing: boolean }
interface XlsxStats { total: number; paid: number; both: number; emailOnly: number; marketing: number }

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
  const [extraEmailInput, setExtraEmailInput] = useState('')
  const [extraEmails, setExtraEmails] = useState<string[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)

  // 발송
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sentCount: number; failCount: number; remaining: number; hasPending: boolean; campaignId: string } | null>(null)

  // 이력
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [historyDetail, setHistoryDetail] = useState<Campaign | null>(null)
  const [historyPreview, setHistoryPreview] = useState(false)
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
      .map(m => m.email)
    const all = Array.from(new Set([...fromGroups, ...extraEmails]))
    return all
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
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .insert({ title: campaignTitle || subject, subject, html_content: htmlContent, groups: selectedGroups })
          .select().single()
        if (error || !campaign) throw new Error('캠페인 생성 실패: ' + error?.message)
        cid = campaign.id
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
    setExtraEmails([]); setExtraEmailInput('')
    setSendResult(null); setTab(0)
    // 수신자 파일은 유지 (재사용 가능하도록)
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
              <Btn primary onClick={() => {
                if (!subject.trim()) { showToast('메일 제목을 입력해주세요.', 'err'); return }
                if (!htmlContent.trim()) { showToast('메일 내용을 입력해주세요.', 'err'); return }
                setTab(2)
              }}>다음: 수신자 선택 →</Btn>
            </div>
          </div>
        )}

        {/* ══ Tab 2: 수신자 선택 ══ */}
        {tab === 2 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>수신자 선택</h2>

            {/* 그룹 선택 */}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>업로드된 파일에서 그룹 선택</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { key: '결제회원', label: '💳 결제회원', count: xlsxStats?.paid ?? 0, color: '#16a34a', bg: '#dcfce7' },
                { key: '이메일+전화번호', label: '📋 이메일+전화', count: xlsxStats?.both ?? 0, color: '#d97706', bg: '#fef3c7' },
                { key: '이메일만', label: '✉️ 이메일만', count: xlsxStats?.emailOnly ?? 0, color: '#7c3aed', bg: '#ede9fe' },
              ].map(g => {
                const active = selectedGroups.includes(g.key)
                return (
                  <button key={g.key}
                    onClick={() => setSelectedGroups(prev => prev.includes(g.key) ? prev.filter(x => x !== g.key) : [...prev, g.key])}
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
              <button onClick={() => setMktOnly(p => !p)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', border: `1.5px solid ${mktOnly ? '#0891b2' : '#e2e8f0'}`, borderRadius: 10, background: mktOnly ? '#ecfeff' : 'white', color: mktOnly ? '#0e7490' : '#64748b', fontSize: 13, fontWeight: mktOnly ? 700 : 500, cursor: 'pointer', marginBottom: 16, transition: 'all .15s', fontFamily: 'inherit' }}>
                <span style={{ fontSize: 16 }}>📢</span>
                마케팅 동의한 회원만
                {mktOnly && <span style={{ marginLeft: 4, background: '#0891b2', color: 'white', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 800 }}>ON</span>}
              </button>
            )}

            {/* 수기 이메일 */}
            <div style={{ background: 'white', borderRadius: 14, padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,.04)', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>수기 이메일 추가</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>쉼표·줄바꿈으로 여러 개 한번에 입력 가능</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea value={extraEmailInput} onChange={e => setExtraEmailInput(e.target.value)}
                  placeholder={'email1@example.com\nemail2@example.com'}
                  style={{ flex: 1, padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minHeight: 72, resize: 'vertical', outline: 'none' }} />
                <button onClick={addExtraEmail}
                  style={{ padding: '0 18px', background: '#3d4fd7', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'stretch' }}>추가</button>
              </div>
              {extraEmails.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {extraEmails.map(email => (
                    <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#eff2ff', border: '1px solid #c7d2fe', borderRadius: 20, fontSize: 12, color: '#3d4fd7' }}>
                      {email}
                      <button onClick={() => setExtraEmails(prev => prev.filter(e => e !== email))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 수신자 합계 */}
            {recipientEmails.length > 0 && (
              <div style={{ padding: '14px 18px', background: '#eff2ff', border: '1px solid #c7d2fe', borderRadius: 10, fontSize: 14, color: '#3d4fd7', fontWeight: 600, marginBottom: 16 }}>
                📬 총 <span style={{ fontSize: 22, fontWeight: 900 }}>{recipientEmails.length.toLocaleString()}</span>명에게 발송됩니다
                {mktOnly && <span style={{ fontSize: 12, marginLeft: 8, opacity: .8 }}>(마케팅 동의자만)</span>}
                {extraEmails.length > 0 && <span style={{ fontSize: 12, marginLeft: 8, opacity: .8 }}>(수기 {extraEmails.length}명 포함)</span>}
              </div>
            )}

            <button onClick={() => setPreviewOpen(true)}
              style={{ width: '100%', padding: '12px', border: '1.5px dashed #3d4fd7', borderRadius: 10, background: 'transparent', cursor: 'pointer', color: '#3d4fd7', fontWeight: 700, fontSize: 14, marginBottom: 28 }}>
              🔍 메일 최종 미리보기
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
              <div style={{ textAlign: 'center' }}>
                <button onClick={() => handleSend()} disabled={sending}
                  style={{ padding: '16px 52px', background: sending ? '#94a3b8' : 'linear-gradient(135deg,#e84393,#f472b6)', color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 900, cursor: sending ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10, boxShadow: sending ? 'none' : '0 4px 20px rgba(232,67,147,.4)' }}>
                  {sending ? <><Spinner /> 발송 중...</> : '🚀 메일 발송 시작'}
                </button>
                <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>발송 후 취소할 수 없습니다.</p>
              </div>
            ) : sendResult.hasPending ? (
              <div style={{ padding: '28px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>오늘 분 발송 완료!</div>
                <div style={{ fontSize: 15, color: '#78350f', marginBottom: 16, lineHeight: 1.8 }}>
                  오늘 <b>{sendResult.sentCount.toLocaleString()}명</b> 발송 완료<br />
                  <b style={{ color: '#d97706' }}>{sendResult.remaining.toLocaleString()}명</b>이 대기 중입니다.
                </div>
                <button onClick={() => handleSend(sendResult.campaignId, true)} disabled={sending}
                  style={{ padding: '12px 32px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {sending ? <><Spinner /> 발송 중...</> : `▶ 이어서 발송 (${sendResult.remaining.toLocaleString()}명)`}
                </button>
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
                  <div key={c.id} onClick={() => { setHistoryDetail(c); setHistoryPreview(false) }}
                    style={{ background: 'white', borderRadius: 14, padding: '18px 22px', border: '1px solid #e2e8f0', borderLeft: `4px solid ${c.status === 'done' ? '#22c55e' : c.status === 'pending' ? '#f59e0b' : c.status === 'error' ? '#ef4444' : '#e2e8f0'}`, cursor: 'pointer', transition: 'box-shadow .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.1)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <StatusBadge status={c.status} />
                          <span style={{ fontSize: 15, fontWeight: 800 }}>{c.title}</span>
                          {c.status === 'pending' && (c.pending_emails?.length ?? 0) > 0 && (
                            <span onClick={e => { e.stopPropagation(); setContinueCampaign(c) }}
                              style={{ padding: '3px 10px', background: '#f59e0b', color: 'white', borderRadius: 20, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                              ▶ 이어서 발송 ({c.pending_emails!.length.toLocaleString()}명)
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
                        <div>{new Date(c.sent_at ?? c.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
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
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.3)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <StatusBadge status={historyDetail.status} />
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{historyDetail.title}</span>
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>제목: {historyDetail.subject}</div>
              </div>
              <button onClick={() => setHistoryDetail(null)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 20, color: '#64748b' }}>×</button>
            </div>
            <div style={{ padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 20, fontSize: 13, color: '#64748b', flexWrap: 'wrap' }}>
              <span>📮 {historyDetail.groups.join(', ') || '수기 발송'}</span>
              <span>👥 {historyDetail.total_count.toLocaleString()}명</span>
              <span>✅ <b style={{ color: '#15803d' }}>{historyDetail.sent_count.toLocaleString()}명</b></span>
              {historyDetail.fail_count > 0 && <span>❌ <b style={{ color: '#dc2626' }}>{historyDetail.fail_count}명</b></span>}
              <span>📅 {new Date(historyDetail.sent_at ?? historyDetail.created_at).toLocaleString('ko-KR')}</span>
            </div>
            <div style={{ padding: '12px 24px', borderBottom: historyPreview ? '1px solid #e2e8f0' : 'none' }}>
              <button onClick={() => setHistoryPreview(p => !p)}
                style={{ padding: '8px 16px', border: '1.5px solid #c7d2fe', borderRadius: 8, background: historyPreview ? '#eff2ff' : 'white', color: '#3d4fd7', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {historyPreview ? '▲ 닫기' : '▼ 발송된 메일 내용 보기'}
              </button>
            </div>
            {historyPreview
              ? <div style={{ flex: 1, overflow: 'auto' }}><iframe srcDoc={historyDetail.html_content} style={{ width: '100%', height: '100%', minHeight: 480, border: 'none' }} sandbox="allow-same-origin" /></div>
              : <div style={{ padding: 24, color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>위 버튼을 눌러 발송된 메일 내용을 확인하세요</div>
            }
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
              대기 중 <b style={{ color: '#d97706' }}>{(continueCampaign.pending_emails?.length ?? 0).toLocaleString()}명</b>에게<br />오늘 최대 100명을 이어서 발송합니다.
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
    draft:   ['임시저장', '#f1f5f9', '#64748b'],
    sending: ['발송 중',  '#fef9c3', '#a16207'],
    done:    ['완료',    '#dcfce7', '#15803d'],
    error:   ['오류',    '#fee2e2', '#dc2626'],
    pending: ['대기 중', '#fef3c7', '#d97706'],
  }
  const [label, bg, color] = map[status] ?? map.draft
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color }}>{label}</span>
}

function Spinner() {
  return <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
}
