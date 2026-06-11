"use client";
import { useEffect } from "react";
import { toast } from "sonner";

// 수정 폼 저장 → 상세 redirect 도착 시 토스트(세션 플래그는 폼이 set, 여기서 소비).
export function SavedToast({ id }: { id: string }) {
  useEffect(() => {
    // 플래그를 고객 id로 스코프 — 중단된 저장의 잔여 플래그가 다른 고객 상세에서 오발화하지 않게.
    if (sessionStorage.getItem("jh-customer-saved") === id) {
      sessionStorage.removeItem("jh-customer-saved");
      toast.success("저장되었습니다");
    }
  }, [id]);
  return null;
}
