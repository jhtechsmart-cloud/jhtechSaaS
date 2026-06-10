"use client";
import { useEffect, useRef, useState } from "react";
import { getQuotePdfUrl } from "@/lib/quotes/actions";

// 견적서 확인(PDF) 버튼 — 발행 직후엔 워커가 PDF를 아직 안 만들어 pdf_url이 없다.
// 생길 때까지 폴링(2.5s)해 새로고침 없이 버튼을 활성화한다. 최대 시도로 무한폴링 방지.
const POLL_MS = 2500;
const MAX_ATTEMPTS = 24; // 약 60초

export function QuotePdfButton({ quoteId, initialPdfUrl }: { quoteId: string; initialPdfUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(initialPdfUrl);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (url) return; // 이미 있으면 폴링 불필요
    let attempts = 0;
    timer.current = setInterval(async () => {
      attempts += 1;
      const u = await getQuotePdfUrl(quoteId);
      if (u || attempts >= MAX_ATTEMPTS) {
        if (u) setUrl(u);
        if (timer.current) clearInterval(timer.current);
      }
    }, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [url, quoteId]);

  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex-1 rounded-md bg-accent py-2 text-center text-small font-medium text-white">
        견적서 확인
      </a>
    );
  }
  // 아직 생성 전 — 비활성 + 생성중 안내(폴링이 곧 활성화).
  return (
    <span className="flex-1 cursor-wait rounded-md bg-surface-2 py-2 text-center text-small font-medium text-muted">
      견적서 생성중…
    </span>
  );
}
