import Link from "next/link";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { listInventory, type InventoryRow } from "@/lib/inventory/queries";
import { InventoryView } from "./_components/InventoryView";

// 영업자용 재고 조회(읽기 전용) — 콘솔 자격자 전원. 편집은 /admin/inventory(equipment.manage).
export default async function InventoryViewPage() {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">콘솔 접근 권한이 필요합니다.</p>
      </div>
    );
  }

  const rows = await listInventory();

  // 분류별 그룹(미분류는 맨 뒤). listInventory가 분류명→장비명 정렬이라 인접 병합.
  const groups: { category: string; rows: InventoryRow[] }[] = [];
  for (const r of rows) {
    const label = r.category ?? "미분류";
    const last = groups[groups.length - 1];
    if (last && last.category === label) last.rows.push(r);
    else groups.push({ category: label, rows: [r] });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold text-text">재고현황</h1>
          <p className="text-small text-muted">현재 장비 재고를 확인합니다 (읽기 전용)</p>
        </div>
        <Link href="/admin/dashboard" className="shrink-0 text-small text-muted hover:text-text">
          ← 대시보드
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-small text-muted">
          등록된 활성 장비가 없습니다.
        </p>
      ) : (
        <InventoryView groups={groups} />
      )}
    </section>
  );
}
