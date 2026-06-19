import { requireEquipmentManage } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";
import { listInventory, type InventoryRow } from "@/lib/inventory/queries";
import { InventoryTable } from "./_components/InventoryTable";

// 장비 재고현황(#4) — 활성 장비 전체를 분류별로 묶어 한 페이지에. equipment.manage 가드.
// 재고는 관리자가 수기 관리(추후 창고 재고 연동 예정).
export default async function InventoryPage() {
  const access = await requireEquipmentManage();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">재고 관리 권한(equipment.manage)이 필요합니다.</p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const rows = await listInventory();

  // 분류별 그룹(미분류는 맨 뒤). listInventory가 분류명→장비명 정렬이라 순서 보존하며 묶는다.
  const groups: { category: string; rows: InventoryRow[] }[] = [];
  for (const r of rows) {
    const label = r.category ?? "미분류";
    const last = groups[groups.length - 1];
    if (last && last.category === label) last.rows.push(r);
    else groups.push({ category: label, rows: [r] });
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1 font-semibold text-text">재고현황</h1>
        <p className="text-small text-muted">장비별 재고를 수기로 관리합니다. 품절 장비는 입고예정일을 입력하세요.</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-small text-muted">
          등록된 활성 장비가 없습니다.
        </p>
      ) : (
        <InventoryTable groups={groups} />
      )}
    </section>
  );
}
