"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Equipment } from "@jhtechsaas/shared";
import { CompanyForm } from "../_components/CompanyForm";
import { ApplicationPicker } from "../_components/ApplicationPicker";
import { createCustomer } from "@/lib/customers/actions";

type StaffItem = { id: string; name: string };
type CatalogItem = Pick<Equipment, "id" | "name" | "model">;

// 클라이언트 래퍼 — useSearchParams로 ?mode=direct|import 읽기 + 모드 세그먼트 제어.
// Suspense 경계 안에서 렌더되어야 useSearchParams 동작.
export function NewCustomerClient({
  staff,
  catalog,
}: {
  staff: StaffItem[];
  catalog: CatalogItem[];
}) {
  // create 모드: 진입 시 id 확정(페이지 마운트 시 고정)
  const [id] = useState(() => crypto.randomUUID());
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "import" ? "import" : "direct";
  const [activeMode, setActiveMode] = useState<"direct" | "import">(initialMode);

  return (
    <div className="flex flex-col gap-4">
      {/* 모드 세그먼트 — equipment 상태 필터 스타일 미러 */}
      <div className="flex gap-1">
        {(["direct", "import"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setActiveMode(m)}
            className={`rounded-md px-3 py-2 text-small font-medium ${
              activeMode === m ? "bg-accent text-white" : "bg-surface-2 text-muted"
            }`}
          >
            {m === "direct" ? "직접 입력" : "견적요청에서 가져오기"}
          </button>
        ))}
      </div>

      {activeMode === "direct" ? (
        <CompanyForm
          mode="create"
          id={id}
          onSubmit={createCustomer}
          staff={staff}
          catalog={catalog}
        />
      ) : (
        <>
          <h1 className="text-h1 font-semibold text-text">새 고객 등록</h1>
          <ApplicationPicker />
        </>
      )}
    </div>
  );
}
