import { notFound } from "next/navigation";
import { requireCustomersManage } from "@/lib/auth/guard";
import { getCompany, listAssignableStaff } from "@/lib/customers/queries";
import { listEquipment } from "@/lib/equipment/queries";
import { updateCustomer } from "@/lib/customers/actions";
import type { Equipment } from "@jhtechsaas/shared";
import type { CompanyFormValues } from "@/lib/customers/schema";
import { CompanyForm } from "../../_components/CompanyForm";
import { signOut } from "@/app/login/actions";

// Next.js 16: params는 Promise
export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const registeredRaw = sp.registered;
  const registered =
    registeredRaw === "new" ? "new" : registeredRaw === "existing" ? "existing" : null;

  // customers.manage 권한 확인 — layout은 equipment.manage 전용이므로 페이지 레벨에서 재검사.
  const access = await requireCustomersManage();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          고객 관리 권한(customers.manage)이 필요합니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const [company, staffRaw, equipmentAll] = await Promise.all([
    getCompany(id),
    listAssignableStaff(),
    listEquipment(),
  ]);

  // 업체가 없으면 404
  if (!company) notFound();

  const staff = staffRaw.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
  // active 장비만 카탈로그로 제공
  const catalog: Pick<Equipment, "id" | "name" | "model">[] = equipmentAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, model: e.model ?? null }));

  // DB row → CompanyFormValues 변환
  const ceRaw = (company as { company_equipment?: unknown[] }).company_equipment ?? [];
  const equipmentValues = (ceRaw as Array<Record<string, unknown>>).map((r) => ({
    id: (r.id as string) ?? "",
    equipment_id: (r.equipment_id as string) ?? "",
    label: (r.label as string) ?? "",
    serial_no: (r.serial_no as string) ?? "",
    purchased_at: (r.purchased_at as string) ?? "",
    install_address: (r.install_address as string) ?? "",
  }));

  const companyValues: CompanyFormValues = {
    name: (company as { name: string }).name,
    biz_no: (company as { biz_no?: string | null }).biz_no ?? "",
    ceo: (company as { ceo?: string | null }).ceo ?? "",
    phone: (company as { phone?: string | null }).phone ?? "",
    email: (company as { email?: string | null }).email ?? "",
    address: (company as { address?: string | null }).address ?? "",
    note: (company as { note?: string | null }).note ?? "",
    assignee_id: (company as { assignee_id?: string | null }).assignee_id ?? "",
    equipment: equipmentValues,
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">고객 수정</h1>
      <CompanyForm
        mode="edit"
        id={id}
        onSubmit={updateCustomer}
        staff={staff}
        catalog={catalog}
        company={companyValues}
        registered={registered}
      />
    </section>
  );
}
