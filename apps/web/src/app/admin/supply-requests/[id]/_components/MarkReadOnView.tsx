"use client";
import { useEffect, useRef } from "react";
import { markSupplyRequestRead } from "@/lib/supply-requests/admin-actions";

// 상세 열람 시 1회 읽음 표시(미열람 배지 해제). 멱등(이미 읽음이면 NULL 조건으로 no-op).
export function MarkReadOnView({ id }: { id: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markSupplyRequestRead(id);
  }, [id]);
  return null;
}
