"use client";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { customerListParamsSchema, type CustomerListParams } from "@/lib/customers/list-table";

// URL searchParams = 단일 상태원 — 뒤로가기·새로고침·링크 공유 시 그대로 복원.
// q(타이핑)는 replace, 페이지·정렬·필터 전환은 push(뒤로가기로 단계 복원).
export function useListParams(): {
  params: CustomerListParams;
  setParams: (patch: Partial<Record<keyof CustomerListParams, string | number | undefined>>, mode?: "push" | "replace") => void;
} {
  const searchParams = useSearchParams();

  const params = useMemo(() => {
    const raw = Object.fromEntries(searchParams.entries());
    const parsed = customerListParamsSchema.safeParse(raw);
    return parsed.success ? parsed.data : customerListParamsSchema.parse({});
  }, [searchParams]);

  const setParams = useCallback(
    (patch: Partial<Record<keyof CustomerListParams, string | number | undefined>>, mode: "push" | "replace" = "push") => {
      const sp = new URLSearchParams(searchParams.toString());
      // 검색·필터 변경 시 page 1로 리셋(명시적으로 page를 주지 않는 한)
      if (!("page" in patch)) sp.delete("page");
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || v === null) sp.delete(k);
        else sp.set(k, String(v));
      }
      const qs = sp.toString();
      const url = qs ? `?${qs}` : window.location.pathname;
      // 서버 재조회 없는 shallow 갱신 — useSearchParams는 native history와 연동됨
      if (mode === "replace") window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [searchParams],
  );

  return { params, setParams };
}
