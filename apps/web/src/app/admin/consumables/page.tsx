import Link from "next/link";
import { requireConsumablesManage } from "@/lib/auth/guard";
import { listConsumables } from "@/lib/consumables/queries";
import { ConsumableTable } from "./_components/ConsumableTable";
import { signOut } from "@/app/login/actions";

// ⚠️ admin/layout은 equipment.manage 전용 가드 → consumables.manage 별도 확인 필수.
export default async function ConsumablesListPage() {
  const access = await requireConsumablesManage();
  if (access.status === "forbidden") return <Forbidden />;
  const items = await listConsumables();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">소모품</h1>
        <Link href="/admin/consumables/new" className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white">+ 새 소모품</Link>
      </div>
      <ConsumableTable items={items} />
    </section>
  );
}

function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
      <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
      <p className="text-small text-muted">소모품 관리 권한(consumables.manage)이 필요합니다. 관리자에게 문의하세요.</p>
      <form action={signOut}><button className="text-small text-accent underline">로그아웃</button></form>
    </main>
  );
}
