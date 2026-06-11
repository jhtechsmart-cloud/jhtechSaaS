import type { Metadata } from "next";
import "./globals.css";
import { siteUrl } from "@/lib/seo/site";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
