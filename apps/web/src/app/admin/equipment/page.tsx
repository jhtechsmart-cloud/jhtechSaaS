import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requireEquipmentDetailRead } from "@/lib/auth/guard";
import { listEquipment } from "@/lib/equipment/queries";
import { EquipmentTable } from "./_components/EquipmentTable";

// 서버 컴포넌트 — 전량 fetch 후 클라이언트 테이블에 전달(검색·필터·5-state는 거기서).
// #243: 읽기 가드 신설(리포트 조회 3키 ∪ manage). 쓰기 UI는 manage 보유자만.
export default async function EquipmentListPage() {
  const access = await requireEquipmentDetailRead();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">장비 카탈로그 조회 권한이 필요합니다.</p>
      </div>
    );
  }
  const canManage = can(access.permissions, "equipment.manage");
  const items = await listEquipment();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">장비</h1>
        {canManage && (
          <Link
            href="/admin/equipment/new"
            className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
          >
            + 새 장비
          </Link>
        )}
      </div>
      <EquipmentTable items={items} canManage={canManage} />
    </section>
  );
}
