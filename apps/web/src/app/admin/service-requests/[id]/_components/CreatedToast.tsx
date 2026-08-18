"use client";
import { useEffect } from "react";
import { toast } from "sonner";

// 대행 접수 직후 상세 도착 시 접수번호 토스트 1회(#281). ?created= 는 URL에서 제거(새로고침 재노출 방지).
export function CreatedToast({ seqNo }: { seqNo: string }) {
  useEffect(() => {
    // id 고정 → StrictMode 이중 effect·재렌더에도 토스트 1개(sonner가 같은 id는 갱신).
    toast.success(`${seqNo} 접수되었습니다`, { id: `sr-created-${seqNo}` });
    const url = new URL(window.location.href);
    url.searchParams.delete("created");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [seqNo]);
  return null;
}
