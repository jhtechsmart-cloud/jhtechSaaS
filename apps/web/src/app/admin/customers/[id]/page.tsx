import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { SavedToast } from "./_components/SavedToast";
import { requireCustomersEdit } from "@/lib/auth/guard";
import { getCompanyDetail, getCustomerHistory } from "@/lib/customers/queries";
import { summarizeApplications, summarizeRequests } from "@/lib/customers/history";
import { tradeStatusOf } from "@/lib/customers/detail-display";
import { signOut } from "@/app/login/actions";
import { CustomerHeader } from "./_components/CustomerHeader";
import { PrimaryContactCard, CustomerInfoCards, type CompanyDetailFields } from "./_components/CustomerInfoSidebar";
import { CustomerActivityTabs, type EquipmentRow } from "./_components/CustomerActivityTabs";
import type { KpiCell } from "./_components/CustomerKpiStrip";

// 고객 상세 — CRM 레코드 페이지 패턴(좌=레코드 정보 330px, 우=거래 활동 탭).
// 데이터 페칭은 기존 그대로(getCompanyDetail + getCustomerHistory 병렬) — 표현 레이어만 개편.
// ⚠️ admin/layout은 equipment.manage 가드 → customers.edit 별도 확인 필수.
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireCustomersEdit();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          고객 관리 권한(customers.edit)이 필요합니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  // 업체+장비와 이력(RPC)을 병렬 fetch.
  const [company, history] = await Promise.all([getCompanyDetail(id), getCustomerHistory(id)]);

  if (!company) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">고객을 찾을 수 없습니다.</p>
        <Link href="/admin/customers" className="text-small text-accent">← 목록으로</Link>
      </div>
    );
  }

  const c = company as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
  const equipment = (c.company_equipment as EquipmentRow[] | null) ?? [];
  const assigneeName = (c.profiles as { name?: string } | null)?.name ?? "미배정";

  const fields: CompanyDetailFields = {
    manager: str(c.manager),
    phone: str(c.phone),
    phone1: str(c.phone1),
    phone2: str(c.phone2),
    mobile: str(c.mobile),
    fax: str(c.fax),
    email: str(c.email),
    address: str(c.address),
    biz_type: str(c.biz_type),
    biz_item: str(c.biz_item),
    address_actual1: str(c.address_actual1),
    address_actual2: str(c.address_actual2),
    ledger_name: str(c.ledger_name),
    ledger_no: typeof c.ledger_no === "number" ? c.ledger_no : null,
  };

  const quoteSummary = summarizeApplications(history.applications);
  const asSummary = summarizeRequests(history.service_requests);
  const supplySummary = summarizeRequests(history.supply_requests);
  const lastPurchase = equipment
    .map((e) => e.purchased_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  const counts = {
    quotes: quoteSummary.total,
    equipment: equipment.length,
    as: asSummary.total,
    supply: supplySummary.total,
  };
  const kpiCells: KpiCell[] = [
    { key: "quotes", label: "견적", count: counts.quotes, sub: counts.quotes ? `완료 ${quoteSummary.completed}건` : null },
    { key: "equipment", label: "보유장비", count: counts.equipment, sub: lastPurchase ? `최근 구입 ${lastPurchase}` : null },
    { key: "as", label: "A/S 신청", count: counts.as, sub: counts.as ? `완료 ${asSummary.completed}건` : null },
    { key: "supply", label: "소모품 신청", count: counts.supply, sub: counts.supply ? `완료 ${supplySummary.completed}건` : null },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/customers" className="text-small text-muted hover:text-text">← 고객 목록</Link>

      <CustomerHeader
        id={id}
        name={str(c.name) ?? "(이름 없음)"}
        ceo={str(c.ceo)}
        bizNo={str(c.biz_no)}
        assigneeName={assigneeName}
        ledgerNo={fields.ledger_no}
        tradeStatus={tradeStatusOf(counts)}
        kpiCells={kpiCells}
      />

      {/* 2단 그리드(330px + 1fr). 모바일 1단 스택: 주 연락처 → 거래 활동 → 나머지 정보 카드. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[330px_1fr] lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-1 lg:row-start-1">
          <PrimaryContactCard c={fields} />
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <CustomerActivityTabs
            companyId={id}
            applications={history.applications}
            equipment={equipment}
            serviceRequests={history.service_requests}
            supplyRequests={history.supply_requests}
            counts={counts}
          />
        </div>
        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-2">
          <CustomerInfoCards c={fields} />
        </div>
      </div>

      <Toaster position="bottom-center" />
      <SavedToast id={id} />
    </div>
  );
}
