import type { Metadata } from "next";
import "./globals.css";
import { siteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "재현테크 견적관리",
    template: "%s | (주)재현테크",
  },
  description: "(주)재현테크 견적 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
