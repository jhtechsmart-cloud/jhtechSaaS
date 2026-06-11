"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomerKpiCards } from "./CustomerKpiCards";
import { CustomerToolbar } from "./CustomerToolbar";
import { CustomerTable } from "./CustomerTable";

// 목록 셸 — 페이지 단위 QueryClient(고객 목록 전용 캐시). 서버가 staff·regions·존재여부만 내려줌.
export function CustomerListShell({
  regions,
  staff,
  hasAnyCustomer,
}: {
  regions: string[];
  staff: { id: string; name: string }[];
  hasAnyCustomer: boolean;
}) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <div className="flex flex-col gap-4">
        <CustomerKpiCards />
        <CustomerToolbar regions={regions} staff={staff} />
        <CustomerTable hasAnyCustomer={hasAnyCustomer} />
      </div>
    </QueryClientProvider>
  );
}
