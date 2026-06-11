"use client";
import { useEffect } from "react";
import { toast } from "sonner";

// 수정 폼 저장 → 상세 redirect 도착 시 토스트(세션 플래그는 폼이 set, 여기서 소비).
export function SavedToast() {
  useEffect(() => {
    if (sessionStorage.getItem("jh-customer-saved") === "1") {
      sessionStorage.removeItem("jh-customer-saved");
      toast.success("저장되었습니다");
    }
  }, []);
  return null;
}
