import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface CrmMember {
  id: string
  email: string
  parent_name: string | null
  phone: string | null
  social_type: string | null
  member_status: string | null
  join_date: string | null
  profile_date: string | null
  last_pay_date: string | null
  is_paid: boolean
  watch_count: number
  child_name: string | null
  last_watch_date: string | null
  created_at: string
  updated_at: string
}
