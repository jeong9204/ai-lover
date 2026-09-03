import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Lover",
  description: "대화가 끝나도 관계가 이어지는 AI 연인",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
