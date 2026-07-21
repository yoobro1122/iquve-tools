import "./globals.css";

export const metadata = {
  title: "인플루언서 발굴 & 관리",
  description: "아이큐브 제휴 후보 검색 · 등록 · 진행상태 관리",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
