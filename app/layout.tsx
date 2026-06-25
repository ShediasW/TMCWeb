import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "블랙스완 프래질리티 시뮬레이터",
  description:
    "나심 탈레브 기반 — 예측의 정확성이 아니라, 예측에 근거한 행동(전략)이 블랙스완 앞에서 프래질한가를 평가한다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
