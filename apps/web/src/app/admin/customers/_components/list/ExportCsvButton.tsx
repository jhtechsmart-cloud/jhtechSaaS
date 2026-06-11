"use client";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";

// CSV 내보내기 — 현재 검색·필터 파라미터를 그대로 들고 export 라우트로.
export function ExportCsvButton() {
  const sp = useSearchParams();
  const qs = sp.toString();
  return (
    <a href={`/admin/customers/export${qs ? `?${qs}` : ""}`} className={buttonVariants({ variant: "outline" })}>
      내보내기(CSV)
    </a>
  );
}
