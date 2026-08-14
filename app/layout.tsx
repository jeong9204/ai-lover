import type { Metadata } from "next";
import { PERSONA_NAME } from "@/lib/persona";
import "./globals.css";

export const metadata: Metadata = {
  title: `${PERSONA_NAME} — AI 연인`,
  description: "대화를 끝낸 뒤에도 관계가 계속되는 AI 연인 프로토타입",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
