import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type Category = '결제회원' | '이메일+전화번호' | '이메일만'

export interface Member {
  id: string
  email: string
  phone: string | null
  category: Category
  paid: boolean
  marketing: boolean
  created_at: string
}

export interface Campaign {
  id: string
  title: string
  subject: string
  html_content: string
  groups: Category[]
  status: 'draft' | 'sending' | 'done' | 'error' | 'pending'
  total_count: number
  sent_count: number
  fail_count: number
  pending_emails: string[]
  batch_index: number
  daily_limit: number
  created_at: string
  sent_at: string | null
  scheduled_at: string | null
}
