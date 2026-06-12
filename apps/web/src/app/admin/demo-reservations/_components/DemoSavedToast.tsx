"use client";

import { useEffect } from "react";
import { toast } from "sonner";

// 등록 성공 후 목록 도착 시 토스트 — 세션 플래그(고객 SavedToast 패턴, 네비게이션 너머 전달).
export function DemoSavedToast() {
  useEffect(() => {
    if (sessionStorage.getItem("jh-demo-saved") === "1") {
      sessionStorage.removeItem("jh-demo-saved");
      toast.success("예약이 등록되었습니다");
    }
  }, []);
  return null;
}
