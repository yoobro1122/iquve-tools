'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Campaign, Category } from '@/lib/supabase'

interface DBStats { total: number; 결제회원: number; '이메일+전화번호': number; 이메일만: number }

const CAT_LABELS: Record<Category, string> = {
  결제회원: '💳 결제회원',
  '이메일+전화번호': '📋 이메일 + 전화번호',
  이메일만: '✉️ 이메일만',
}
const TABS = ['① DB 업로드', '② 메일 작성', '③ 수신 그룹', '④ 발송 확인', '📋 발송 이력']

const S = {
  card: { background: 'white', borderRadius: 16, padding: '28px', border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,.05)' } as React.CSSProperties,
  input: { width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'white', color: '#1e293b' } as React.CSSProperties,
  label: { fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6, display: 'block' } as React.CSSProperties,
  section: { fontSize: 20, fontWeight: 800, marginBottom: 20, color: '#1a1f36' } as React.CSSProperties,
}

export default function Home() {
  const [tab, setTab] = useState(0)
  const [dbStats, setDbStats] = useState<DBStats | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [campaignTitle, setCampaignTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [htmlMode, setHtmlMode] = useState<'upload' | 'editor'>('upload')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<Category[]>([])
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [extraEmailInput, setExtraEmailInput] = useState('')
  const [extraEmails, setExtraEmails] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sentCount: number; failCount: number; sentToday: number; remaining: number; hasPending: boolean; campaignId: string } | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [historyDetail, setHistoryDetail] = useState<Campaign | null>(null)
  const [continueCampaign, setContinueCampaign] = useState<Campaign | null>(null)
  const dbFileRef = useRef<HTMLInputElement>(null)
  const htmlFileRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)

  function showToast(msg: string, type: 'ok' | 'err' | 'info' = 'info') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function loadStats() {
    const { data } = await supabase.from('members').select('category')
    if (!data) return
    const s: DBStats = { total: data.length, 결제회원: 0, '이메일+전화번호': 0, 이메일만: 0 }
    data.forEach((r: { category: Category }) => { s[r.category]++ })
    setDbStats(s)
  }

  async function loadCampaigns() {
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(50)
    if (data) setCampaigns(data as Campaign[])
  }

  useEffect(() => { loadStats(); loadCampaigns() }, [])

  useEffect(() => {
    if (selectedGroups.length === 0 && extraEmails.length === 0) { setRecipientCount(null); return }
    if (selectedGroups.length === 0) { setRecipientCount(extraEmails.length); return }
    supabase.from('members').select('id', { count: 'exact', head: true }).in('category', selectedGroups)
      .then(({ count }) => setRecipientCount((count ?? 0) + extraEmails.length))
  }, [selectedGroups, extraEmails])

  async function handleDbUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setUploadResult(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch('/api/upload-members', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setUploadResult(`✅ ${json.inserted}명 저장 완료 (내부 도메인·중복 ${json.skipped + json.duplicates}건 제외)\n  💳 결제 ${json.categories['결제회원']}  📋 이메일+전화 ${json.categories['이메일+전화번호']}  ✉️ 이메일만 ${json.categories['이메일만']}`)
      showToast(`${json.inserted}명 DB 저장 완료`, 'ok')
      await loadStats()
    } catch (err: unknown) { showToast(err instanceof Error ? err.message : '오류', 'err') }
    finally { setUploading(false); if (dbFileRef.current) dbFileRef.current.value = '' }
  }

  async function handleHtmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch('/api/upload-template', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setHtmlContent(json.html); showToast('HTML 템플릿 로드 완료', 'ok')
    } catch (err: unknown) { showToast(err instanceof Error ? err.message : '오류', 'err') }
    finally { if (htmlFileRef.current) htmlFileRef.current.value = '' }
  }

  function addExtraEmail() {
    const raw = extraEmailInput.trim().toLowerCase(); if (!raw) return
    const list = raw.split(/[\s,;\n]+/).filter(e => e.includes('@'))
    const newOnes = list.filter(e => !extraEmails.includes(e))
    if (newOnes.length === 0) { showToast('이미 추가된 이메일이거나 형식이 올바르지 않습니다.', 'err'); return }
    setExtraEmails(prev => [...prev, ...newOnes]); setExtraEmailInput('')
    showToast(`${newOnes.length}개 추가됨`, 'ok')
  }

  async function handleSend(campaignId?: string, isContinue = false) {
    if (!isContinue) {
      if (!subject.trim()) { showToast('메일 제목을 입력해주세요.', 'err'); return }
      if (!htmlContent.trim()) { showToast('메일 내용을 입력해주세요.', 'err'); return }
      if (selectedGroups.length === 0 && extraEmails.length === 0) { showToast('발송 그룹 또는 수기 이메일을 추가해주세요.', 'err'); return }
    }
    setSending(true); setSendResult(null)
    try {
      let cid = campaignId
      if (!isContinue) {
        const { data: campaign, error } = await supabase.from('campaigns').insert({ title: campaignTitle || subject, subject, html_content: htmlContent, groups: selectedGroups }).select().single()
        if (error || !campaign) throw new Error('캠페인 생성 실패: ' + error?.message)
        cid = campaign.id
      }
      const res = await fetch('/api/send-campaign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: cid, extraEmails, isContinue }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSendResult({ ...json, campaignId: cid })
      if (json.hasPending) {
        showToast(`오늘 ${json.sentCount}건 발송 완료! 내일 ${json.remaining}명 이어서 발송 가능`, 'info')
      } else {
        showToast(`전체 발송 완료! ${json.sentCount}건 성공`, 'ok')
      }
      await loadCampaigns()
    } catch (err: unknown) { showToast(err instanceof Error ? err.message : '오류', 'err') }
    finally { setSending(false) }
  }

  function resetAll() {
    setCampaignTitle(''); setSubject(''); setHtmlContent(''); setSelectedGroups([])
    setExtraEmails([]); setExtraEmailInput(''); setRecipientCount(null); setSendResult(null); setTab(0)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f9' }}>
      <header style={{ background: 'linear-gradient(135deg,#3d4fd7,#5b6ef5)', padding: '18px 36px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 3px 20px rgba(61,79,215,.3)' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: -1 }}>
          i<span style={{ color: '#a8b4ff' }}>Q</span>uve <span style={{ fontWeight: 400, opacity: .7, fontSize: 18 }}>메일 발송</span>
        </div>
        {dbStats && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, fontSize: 13, color: 'rgba(255,255,255,.8)' }}>
            <span>전체 <b style={{ color: 'white', fontSize: 15 }}>{dbStats.total.toLocaleString()}</b>명</span>
            <span>💳 <b style={{ color: 'white' }}>{dbStats.결제회원}</b></span>
            <span>📋 <b style={{ color: 'white' }}>{dbStats['이메일+전화번호']}</b></span>
            <span>✉️ <b style={{ color: 'white' }}>{dbStats.이메일만}</b></span>
          </div>
        )}
      </header>

      <nav style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 36px', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {TABS.map((label, i) => (
          <button key={i} onClick={() => { setTab(i); if (i === 4) loadCampaigns() }}
            style={{ padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === i ? 700 : 400, whiteSpace: 'nowrap', color: tab === i ? '#3d4fd7' : '#64748b', borderBottom: tab === i ? '2px solid #3d4fd7' : '2px solid transparent', transition: 'all .15s' }}>
            {label}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 860, margin: '32px auto', padding: '0 24px' }}>

        {/* ─── Tab 0: DB 업로드 ─── */}
        {tab === 0 && (
          <div>
            <h2 style={S.section}>회원 DB 업로드</h2>
            <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14, lineHeight: 1.8 }}>
              엑셀 파일을 업로드하세요. <b>@growv.com / @growv.kr</b> 내부 주소와 중복 이메일은 자동 제외됩니다.
            </p>
            <UploadZone icon="📊" label="엑셀 파일 (.xlsx) 드래그 앤 드롭 또는 클릭" accept=".xlsx,.xls" loading={uploading} inputRef={dbFileRef} onChange={handleDbUpload} />
            {uploadResult && <div style={{ marginTop: 16, padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, fontSize: 13, color: '#15803d', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{uploadResult}</div>}
            {dbStats && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 10, letterSpacing: .5 }}>현재 DB 현황</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                  {[{ label: '전체', val: dbStats.total, color: '#64748b' }, { label: '💳 결제회원', val: dbStats.결제회원, color: '#e84393' }, { label: '📋 이메일+전화', val: dbStats['이메일+전화번호'], color: '#3d4fd7' }, { label: '✉️ 이메일만', val: dbStats.이메일만, color: '#8b5cf6' }].map(s => <StatCard key={s.label} {...s} />)}
                </div>
              </div>
            )}
            <div style={{ marginTop: 28, textAlign: 'right' }}><Btn primary onClick={() => setTab(1)}>다음: 메일 작성 →</Btn></div>
          </div>
        )}

        {/* ─── Tab 1: 메일 작성 ─── */}
        {tab === 1 && (
          <div>
            <h2 style={S.section}>메일 작성</h2>
            <div style={S.card}>
              <label style={S.label}>캠페인 이름 (내부용)</label>
              <input style={S.input} value={campaignTitle} onChange={e => setCampaignTitle(e.target.value)} placeholder="예: 4월 첫째주 뉴스레터" />
              <label style={{ ...S.label, marginTop: 20 }}>메일 제목 *</label>
              <input style={S.input} value={subject} onChange={e => setSubject(e.target.value)} placeholder="예: 아이큐브에서 드리는 특별한 소식 🎉" />
              <label style={{ ...S.label, marginTop: 20 }}>메일 본문 (HTML) *</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <TabBtn active={htmlMode === 'upload'} onClick={() => setHtmlMode('upload')}>📁 HTML 파일 업로드</TabBtn>
                <TabBtn active={htmlMode === 'editor'} onClick={() => setHtmlMode('editor')}>✏️ 직접 입력</TabBtn>
              </div>
              {htmlMode === 'upload' ? (
                <div>
                  <UploadZone icon="🌐" label="HTML 파일 드래그 앤 드롭 또는 클릭 (최대 5MB)" accept=".html,.htm" loading={false} inputRef={htmlFileRef} onChange={handleHtmlUpload} compact />
                  {htmlContent && <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#15803d' }}>✅ HTML 로드됨 · {(htmlContent.length / 1024).toFixed(1)}KB</div>}
                </div>
              ) : (
                <textarea value={htmlContent} onChange={e => setHtmlContent(e.target.value)} placeholder="<html>...</html>"
                  style={{ width: '100%', minHeight: 280, padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', outline: 'none', background: '#f8fafc', color: '#1e293b', lineHeight: 1.6 }} />
              )}
              {htmlContent && (
                <button onClick={() => setPreviewOpen(true)}
                  style={{ marginTop: 14, width: '100%', padding: '11px', border: '1.5px dashed #3d4fd7', borderRadius: 10, background: 'transparent', cursor: 'pointer', color: '#3d4fd7', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
                  🔍 메일 미리보기
                </button>
              )}
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setTab(0)}>← 이전</Btn>
              <Btn primary onClick={() => {
                if (!subject.trim()) { showToast('메일 제목을 입력해주세요.', 'err'); return }
                if (!htmlContent.trim()) { showToast('메일 내용을 입력해주세요.', 'err'); return }
                setTab(2)
              }}>다음: 수신 그룹 →</Btn>
            </div>
          </div>
        )}

        {/* ─── Tab 2: 수신 그룹 ─── */}
        {tab === 2 && (
          <div>
            <h2 style={S.section}>수신 그룹 선택</h2>
            <div style={S.card}>
              <label style={S.label}>DB 그룹 선택</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {(Object.entries(CAT_LABELS) as [Category, string][]).map(([cat, label]) => {
                  const active = selectedGroups.includes(cat)
                  const count = dbStats?.[cat as keyof DBStats] as number | undefined
                  return (
                    <button key={cat} onClick={() => setSelectedGroups(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
                      style={{ padding: '16px', border: `2px solid ${active ? '#3d4fd7' : '#e2e8f0'}`, borderRadius: 12, background: active ? '#eff2ff' : 'white', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', fontFamily: 'inherit' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: active ? '#3d4fd7' : '#374151', marginBottom: 4 }}>{label}</div>
                      {count !== undefined && <div style={{ fontSize: 13, color: '#94a3b8' }}>{count.toLocaleString()}명</div>}
                      {active && <div style={{ fontSize: 12, color: '#3d4fd7', marginTop: 4 }}>✓ 선택됨</div>}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ ...S.card, marginTop: 16 }}>
              <label style={S.label}>수기 이메일 추가</label>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>쉼표(,)나 줄바꿈으로 여러 개를 한번에 입력할 수 있습니다.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...S.input, flex: 1 }} value={extraEmailInput} onChange={e => setExtraEmailInput(e.target.value)}
                  placeholder="example@email.com, another@email.com"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtraEmail() } }} />
                <button onClick={addExtraEmail}
                  style={{ padding: '10px 18px', background: '#3d4fd7', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>추가</button>
              </div>
              {extraEmails.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {extraEmails.map(email => (
                    <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#f0f2ff', border: '1px solid #c7d2fe', borderRadius: 20, fontSize: 13, color: '#3d4fd7' }}>
                      {email}
                      <button onClick={() => setExtraEmails(prev => prev.filter(e => e !== email))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {recipientCount !== null && (
              <div style={{ marginTop: 16, padding: '14px 18px', background: '#eff2ff', border: '1px solid #c7d2fe', borderRadius: 12, fontSize: 14, color: '#3d4fd7', fontWeight: 600 }}>
                📬 총 <span style={{ fontSize: 20 }}>{recipientCount.toLocaleString()}</span>명에게 발송됩니다
                {extraEmails.length > 0 && selectedGroups.length > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 8, opacity: .8 }}>
                    (DB {(recipientCount - extraEmails.length).toLocaleString()}명 + 수기 {extraEmails.length}명)
                  </span>
                )}
              </div>
            )}

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setTab(1)}>← 이전</Btn>
              <Btn primary onClick={() => {
                if (selectedGroups.length === 0 && extraEmails.length === 0) { showToast('그룹 또는 수기 이메일을 추가해주세요.', 'err'); return }
                setTab(3)
              }}>다음: 발송 확인 →</Btn>
            </div>
          </div>
        )}

        {/* ─── Tab 3: 발송 확인 ─── */}
        {tab === 3 && (
          <div>
            <h2 style={S.section}>발송 확인</h2>
            <div style={S.card}>
              <SummaryRow label="캠페인" value={campaignTitle || subject} />
              <SummaryRow label="메일 제목" value={subject} />
              <SummaryRow label="발송 그룹" value={selectedGroups.length > 0 ? selectedGroups.map(g => CAT_LABELS[g]).join(', ') : '(없음)'} />
              {extraEmails.length > 0 && <SummaryRow label="수기 추가" value={`${extraEmails.length}개`} />}
              <SummaryRow label="총 수신자" value={`${(recipientCount ?? 0).toLocaleString()}명`} />
              <SummaryRow label="발신자" value="아이큐브 <iquve@growv.com>" />
              <SummaryRow label="HTML 크기" value={`${(htmlContent.length / 1024).toFixed(1)} KB`} />
              <SummaryRow label="배치 발송" value="30건씩 순차 발송 · 배치 간 2초 대기 (스팸 방지)" last />
            </div>
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button onClick={() => setPreviewOpen(true)} style={{ padding: '8px 16px', border: '1.5px solid #3d4fd7', borderRadius: 8, background: 'white', color: '#3d4fd7', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>🔍 메일 미리보기</button>
            </div>
            {!sendResult ? (
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <button onClick={() => handleSend()} disabled={sending}
                  style={{ padding: '16px 52px', background: sending ? '#94a3b8' : '#e84393', color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  {sending ? <><Spinner /> 발송 중... 잠시 기다려주세요</> : '🚀 메일 발송 시작'}
                </button>
                <p style={{ marginTop: 10, fontSize: 13, color: '#94a3b8' }}>발송 후 취소할 수 없습니다.</p>
              </div>
            ) : sendResult.hasPending ? (
              <div style={{ marginTop: 24, padding: '28px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>오늘 분 발송 완료!</div>
                <div style={{ fontSize: 15, color: '#78350f', marginBottom: 16, lineHeight: 1.8 }}>
                  오늘 <b>{sendResult.sentCount.toLocaleString()}명</b> 발송 완료
                  {sendResult.failCount > 0 && <span style={{ color: '#dc2626' }}> ({sendResult.failCount}명 실패)</span>}<br/>
                  <b style={{ color: '#d97706' }}>{sendResult.remaining.toLocaleString()}명</b>이 대기 중이에요.<br/>
                  내일 아래 버튼을 눌러 이어서 발송하세요.
                </div>
                <button onClick={() => handleSend(sendResult.campaignId, true)} disabled={sending}
                  style={{ padding: '12px 32px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {sending ? <><Spinner /> 발송 중...</> : `▶ 지금 이어서 발송 (${sendResult.remaining.toLocaleString()}명)`}
                </button>
                <p style={{ marginTop: 8, fontSize: 12, color: '#a16207' }}>내일 다시 방문하거나, 지금 바로 이어서 발송할 수 있어요.</p>
              </div>
            ) : (
              <div style={{ marginTop: 24, padding: '32px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>전체 발송 완료!</div>
                <div style={{ fontSize: 15, color: '#166534' }}>
                  <b>{sendResult.sentCount.toLocaleString()}명</b> 성공
                  {sendResult.failCount > 0 && <span style={{ color: '#dc2626' }}>, {sendResult.failCount}명 실패</span>}
                </div>
                <button onClick={() => { setTab(4); loadCampaigns() }}
                  style={{ marginTop: 16, padding: '10px 24px', background: 'white', border: '1.5px solid #86efac', borderRadius: 10, color: '#15803d', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                  발송 이력 확인 →
                </button>
              </div>
            )}
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <Btn onClick={() => setTab(2)}>← 이전</Btn>
              {sendResult && <Btn primary onClick={resetAll}>새 캠페인 만들기</Btn>}
            </div>
          </div>
        )}

        {/* ─── Tab 4: 발송 이력 ─── */}
        {tab === 4 && (
          <div>
            <h2 style={S.section}>발송 이력</h2>
            {campaigns.length === 0 ? (
              <div style={{ ...S.card, textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div>아직 발송 이력이 없습니다.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {campaigns.map(c => (
                  <button key={c.id} onClick={() => setHistoryDetail(c)}
                    style={{ ...S.card, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', padding: '20px 24px', transition: 'border-color .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#3d4fd7')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <StatusBadge status={c.status} />
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{c.title}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>제목: {c.subject}</div>
                        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#94a3b8', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span>그룹: {c.groups.join(', ')}</span>
                          <span>수신자: {c.total_count.toLocaleString()}명</span>
                          <span style={{ color: '#16a34a' }}>성공: {c.sent_count.toLocaleString()}</span>
                          {c.fail_count > 0 && <span style={{ color: '#dc2626' }}>실패: {c.fail_count}</span>}
                          {c.status === 'pending' && c.pending_emails?.length > 0 && (
                            <span
                              onClick={e => { e.stopPropagation(); setContinueCampaign(c) }}
                              style={{ padding: '3px 12px', background: '#f59e0b', color: 'white', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                              ▶ 이어서 발송 ({c.pending_emails.length.toLocaleString()}명 대기)
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#cbd5e1', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                        <div>{c.sent_at ? new Date(c.sent_at).toLocaleDateString('ko-KR') : new Date(c.created_at).toLocaleDateString('ko-KR')}</div>
                        <div style={{ marginTop: 4, color: '#3d4fd7', fontWeight: 700 }}>내용 보기 →</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {previewOpen && (
        <Modal onClose={() => setPreviewOpen(false)} title={subject || '(제목 없음)'} subtitle="아이큐브 <iquve@growv.com>">
          <iframe srcDoc={htmlContent || '<p style="padding:20px;color:#888">HTML 내용 없음</p>'} style={{ width: '100%', height: '100%', minHeight: 540, border: 'none' }} title="미리보기" sandbox="allow-same-origin" />
        </Modal>
      )}

      {historyDetail && (
        <Modal onClose={() => setHistoryDetail(null)} title={historyDetail.title} subtitle={`제목: ${historyDetail.subject} · ${historyDetail.groups.join(', ')} · ${historyDetail.total_count.toLocaleString()}명`}>
          <iframe srcDoc={historyDetail.html_content || '<p style="padding:20px;color:#888">내용 없음</p>'} style={{ width: '100%', height: '100%', minHeight: 540, border: 'none' }} title="발송 메일 내용" sandbox="allow-same-origin" />
        </Modal>
      )}

      {/* ── 이어서 발송 확인 모달 ── */}
      {continueCampaign && (
        <div onClick={() => setContinueCampaign(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 18, padding: '36px', maxWidth: 440, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,.25)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{continueCampaign.title}</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24, lineHeight: 1.8 }}>
              대기 중인 수신자 <b style={{ color: '#d97706' }}>{(continueCampaign.pending_emails?.length ?? 0).toLocaleString()}명</b>에게<br/>
              오늘 <b>최대 100명</b>을 이어서 발송합니다.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setContinueCampaign(null)}
                style={{ padding: '10px 24px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                취소
              </button>
              <button
                onClick={async () => {
                  const cid = continueCampaign.id
                  setContinueCampaign(null)
                  setTab(3)
                  setSendResult(null)
                  await handleSend(cid, true)
                }}
                disabled={sending}
                style={{ padding: '10px 28px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {sending ? <><Spinner /> 발송 중...</> : '▶ 이어서 발송'}
              </button>
            </div>
          </div>
        </div>
      )}

            {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, padding: '14px 22px', borderRadius: 12, fontWeight: 600, fontSize: 14, color: 'white', zIndex: 3000, boxShadow: '0 8px 32px rgba(0,0,0,.2)', background: toast.type === 'ok' ? '#16a34a' : toast.type === 'err' ? '#dc2626' : '#3d4fd7', animation: 'fadeIn .2s ease' }}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1}}`}</style>
    </div>
  )
}

function Modal({ children, onClose, title, subtitle }: { children: React.ReactNode; onClose: () => void; title: string; subtitle?: string }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 740, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: '#64748b', flexShrink: 0 }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}

function UploadZone({ icon, label, accept, loading, inputRef, onChange, compact }: { icon: string; label: string; accept: string; loading: boolean; inputRef: React.RefObject<HTMLInputElement>; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; compact?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #c7d2fe', borderRadius: 14, padding: compact ? '18px' : '36px', cursor: loading ? 'not-allowed' : 'pointer', background: '#f8faff', gap: 8, opacity: loading ? .6 : 1 }}>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={onChange} disabled={loading} />
      <div style={{ fontSize: compact ? 28 : 38 }}>{loading ? '⏳' : icon}</div>
      <div style={{ fontSize: 14, color: '#6366f1', fontWeight: 600 }}>{loading ? '업로드 중...' : label}</div>
    </label>
  )
}

function StatCard({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color }}>{val.toLocaleString()}</div>
    </div>
  )
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '11px 0', borderBottom: last ? 'none' : '1px solid #f1f5f9' }}>
      <div style={{ width: 100, fontSize: 13, color: '#94a3b8', flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{value}</div>
    </div>
  )
}

function Btn({ children, primary, onClick }: { children: React.ReactNode; primary?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '10px 24px', border: primary ? 'none' : '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', background: primary ? '#3d4fd7' : 'white', color: primary ? 'white' : '#374151', fontFamily: 'inherit' }}>
      {children}
    </button>
  )
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '8px 14px', border: `1.5px solid ${active ? '#3d4fd7' : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 400, background: active ? '#eff2ff' : 'white', color: active ? '#3d4fd7' : '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const map: Record<string, [string, string, string]> = { draft: ['임시', '#f1f5f9', '#64748b'], sending: ['발송중', '#fef9c3', '#a16207'], done: ['완료', '#dcfce7', '#15803d'], error: ['오류', '#fee2e2', '#dc2626'], pending: ['대기중', '#fef3c7', '#d97706'] }
  const [label, bg, color] = map[status] ?? map.draft
  return <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color }}>{label}</span>
}

function Spinner() {
  return <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 16 }}>⏳</span>
}
