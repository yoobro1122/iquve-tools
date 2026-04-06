import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'iQuve 메일 발송',
  description: 'iQuve 회원 이메일 발송 관리 도구',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
