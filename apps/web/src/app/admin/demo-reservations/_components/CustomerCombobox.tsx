"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchCustomers } from "@/lib/customers/actions";

// 고객 검색 콤보박스 — 기존 고객 선택(companyId 연결) 또는 미등록 직접 입력(이름만 저장).
// 검색은 fetchCustomers 서버 액션 재사용(300ms 디바운스), 선택 해제 후 타이핑 = 직접 입력.

interface Picked {
  companyId: string | null;
  customerName: string;
}

export function CustomerCombobox({
  value,
  onChange,
}: {
  value: Picked;
  onChange: (next: Picked) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // 300ms 디바운스(고객목록 툴바와 동일 UX)
  useEffect(() => {
    const t = setTimeout(() => setQ(value.companyId ? "" : value.customerName), 300);
    return () => clearTimeout(t);
  }, [value.customerName, value.companyId]);

  const search = useQuery({
    queryKey: ["demo-customer-search", q],
    queryFn: () => fetchCustomers({ q, pp: 25 }),
    enabled: open && q.trim().length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const rows = (search.data?.rows ?? []).slice(0, 8);

  // 바깥 클릭 닫기
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <input
        value={value.customerName}
        onChange={(e) => {
          onChange({ companyId: null, customerName: e.target.value });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="고객 검색 또는 미등록 고객명 직접 입력"
        aria-label="고객"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text placeholder:text-muted/50"
      />
      {value.companyId && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-mint px-2 py-0.5 text-micro font-medium text-accent">
          등록 고객
        </span>
      )}

      {open && q.trim().length >= 1 && !value.companyId && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-card-hover">
          {rows.length === 0 ? (
            <p className="px-3 py-2.5 text-small text-muted">
              {search.isFetching ? "검색 중…" : "검색 결과 없음 — 입력한 이름 그대로 저장됩니다"}
            </p>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onChange({ companyId: r.id, customerName: r.name });
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-mint-hover"
              >
                <span className="truncate text-small text-text">{r.name}</span>
                <span className="shrink-0 text-micro text-faint tabular-nums">
                  {r.region ?? ""} {r.biz_no ?? ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
