// ── Supabase 설정 ──
const SUPABASE_URL = 'https://emgsqnzfdvvbtooouaap.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZ3NxbnpmZHZ2YnRvb291YWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxODA4OTEsImV4cCI6MjA5MDc1Njg5MX0.kWXiNT9IbLoGTgzdCe1oCmekOLv_Y-O2bxnCZfn6uR0';
const GEMINI_PROXY_URL = `${SUPABASE_URL}/functions/v1/gemini-proxy`;

// ── Supabase REST API 헬퍼 ──
const sb = {
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  },

  async get(table, filters = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    for (const [k, v] of Object.entries(filters)) url += `&${k}=eq.${encodeURIComponent(v)}`;
    const res = await fetch(url, { headers: this.headers });
    return res.json();
  },

  async upsert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.headers, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(data),
    });
    return res.ok;
  },

  // API 키 저장
  async saveApiKey(keyName, keyValue) {
    return this.upsert('api_config', { key_name: keyName, key_value: keyValue });
  },

  // API 키 조회
  async getApiKey(keyName) {
    const rows = await this.get('api_config', { key_name: keyName });
    return rows?.[0]?.key_value || null;
  },
};

// ── Gemini 프록시 호출 ──
async function geminiText(payload) {
  const res = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ type: 'text', payload }),
  });
  return res.json();
}

async function geminiImage(payload) {
  const res = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ type: 'image', payload }),
  });
  return res.json();
}
