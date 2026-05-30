import Link from "next/link";
import { listEquipment } from "@/lib/equipment/queries";
import { EquipmentTable } from "./_components/EquipmentTable";

// 서버 컴포넌트 — 전량 fetch 후 클라이언트 테이블에 전달(검색·필터·5-state는 거기서).
export default async function EquipmentListPage() {
  const items = await listEquipment();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">장비</h1>
        <Link
          href="/admin/equipment/new"
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
        >
          + 새 장비
        </Link>
      </div>
      <EquipmentTable items={items} />
    </section>
  );
}
