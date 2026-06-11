"use client";
import { useEffect, useRef, useState } from "react";
import { getQuotePdfUrl } from "@/lib/quotes/actions";

// 견적서 확인(PDF) 버튼 — 발행 직후엔 워커가 PDF를 아직 안 만들어 pdf_url이 없다.
// 생길 때까지 폴링(2.5s)해 새로고침 없이 버튼을 활성화한다. 최대 시도로 무한폴링 방지.
// 링크는 서명URL 박제 대신 /admin/quotes/[id]/pdf 라우트 — 클릭 시점에 새 서명URL 발급(만료 없음).
const POLL_MS = 2500;
const MAX_ATTEMPTS = 24; // 약 60초

export function QuotePdfButton({ quoteId, initialReady }: { quoteId: string; initialReady: boolean }) {
  const [ready, setReady] = useState(initialReady);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ready) return; // 이미 있으면 폴링 불필요
    let attempts = 0;
    timer.current = setInterval(async () => {
      attempts += 1;
      try {
        const u = await getQuotePdfUrl(quoteId);
        if (u) {
          setReady(true);
          if (timer.current) clearInterval(timer.current);
          return;
        }
      } catch {
        // 네트워크 순단·세션 오류 — 이번 틱은 건너뛰고 다음 틱에서 재시도
      }
      if (attempts >= MAX_ATTEMPTS && timer.current) clearInterval(timer.current);
    }, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [ready, quoteId]);

  if (ready) {
    return (
      <a
        href={`/admin/quotes/${quoteId}/pdf`}
        target="_blank"
        rel="noreferrer"
        className="flex-1 rounded-md bg-accent py-2 text-center text-small font-medium text-white"
      >
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
