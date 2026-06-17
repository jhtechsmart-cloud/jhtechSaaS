"use client";
import { useEffect, useRef, useState } from "react";
import { isReleaseOrderPdfReady } from "@/lib/release-orders/actions";

// 출고의뢰서 PDF 버튼 — 발행 직후엔 워커가 PDF를 아직 안 만들어 pdf_url이 없다.
// 생길 때까지 폴링(2.5s, 최대 ~60초)해 새로고침 없이 버튼을 활성화. 링크는 클릭 시점 서명URL 발급 라우트.
const POLL_MS = 2500;
const MAX_ATTEMPTS = 24;

export function ReleaseOrderPdfButton({ applicationId, initialReady }: { applicationId: string; initialReady: boolean }) {
  const [ready, setReady] = useState(initialReady);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ready) return;
    let attempts = 0;
    timer.current = setInterval(async () => {
      attempts += 1;
      try {
        if (await isReleaseOrderPdfReady(applicationId)) {
          setReady(true);
          if (timer.current) clearInterval(timer.current);
          return;
        }
      } catch {
        // 순단·세션 오류는 다음 틱에 재시도
      }
      if (attempts >= MAX_ATTEMPTS && timer.current) clearInterval(timer.current);
    }, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [ready, applicationId]);

  if (ready) {
    return (
      <a
        href={`/admin/applications/${applicationId}/release-order/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-accent px-5 py-2 text-small font-semibold text-white"
        data-testid="release-pdf-link"
      >
        출고의뢰서 PDF
      </a>
    );
  }
  return (
    <span className="rounded-full border border-border bg-surface px-5 py-2 text-small text-muted" data-testid="release-pdf-pending">
      PDF 생성 중…
    </span>
  );
}
