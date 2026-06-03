import Link from "next/link";
import { requireCustomersManage } from "@/lib/auth/guard";
import { getCompanyDetail, getCustomerHistory } from "@/lib/customers/queries";
import {
  summarizeApplications,
  summarizeRequests,
  type HistoryApplication,
  type HistoryServiceRequest,
  type HistorySupplyRequest,
} from "@/lib/customers/history";
import { StatusBadge } from "@/lib/request-status";
import { ApplicationStatusBadge } from "@/lib/application-status";
import { signOut } from "@/app/login/actions";

// 통합 고객이력(P-F #24) — 견적/구입/AS/소모품 + 완료여부 한눈에(읽기 전용, E7 확장).
// ⚠️ admin/layout은 equipment.manage 가드 → customers.manage 별도 확인 필수.
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  const equipment = (c.company_equipment as CompanyEquipmentRow[] | null) ?? [];
  const assigneeName = (c.profiles as { name?: string } | null)?.name ?? "미배정";

  const quoteSummary = summarizeApplications(history.applications);
  const asSummary = summarizeRequests(history.service_requests);
  const supplySummary = summarizeRequests(history.supply_requests);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/admin/customers" className="text-small text-muted hover:text-text">← 고객 목록</Link>
          <h1 className="text-h1 font-semibold text-text">{str(c.name) ?? "(이름 없음)"}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted">
            <span>사업자번호 <span className="font-mono tabular-nums text-text">{str(c.biz_no) ?? "-"}</span></span>
            <span>대표 <span className="text-text">{str(c.ceo) ?? "-"}</span></span>
            <span>연락처 <span className="font-mono tabular-nums text-text">{str(c.phone) ?? "-"}</span></span>
            <span>담당영업 <span className="text-text">{assigneeName}</span></span>
          </div>
        </div>
        <Link
          href={`/admin/customers/${id}/edit`}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-small font-medium text-text hover:bg-surface"
        >
          수정
        </Link>
      </div>

      {/* 견적 */}
      <Section title="견적" total={quoteSummary.total} completed={quoteSummary.completed}>
        {history.applications.length === 0 ? (
          <Empty />
        ) : (
          history.applications.map((a: HistoryApplication) => (
            <div key={a.id} className="flex items-center gap-3 py-1.5 text-body">
              <span className="w-40 shrink-0 font-mono tabular-nums text-text">{a.seq_no}</span>
              <ApplicationStatusBadge status={a.status} />
              <span className="ml-auto font-mono tabular-nums text-small text-muted">{dateOnly(a.created_at)}</span>
            </div>
          ))
        )}
      </Section>

      {/* 구입(보유장비) — 완료 개념 없음 */}
      <Section title="구입 (보유장비)" total={equipment.length}>
        {equipment.length === 0 ? (
          <Empty />
        ) : (
          equipment.map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-1.5 text-body">
              <span className="text-text">{equipmentLabel(e)}</span>
              {e.serial_no && <span className="font-mono tabular-nums text-small text-muted">S/N {e.serial_no}</span>}
              <span className="ml-auto font-mono tabular-nums text-small text-muted">{e.purchased_at ?? "-"}</span>
            </div>
          ))
        )}
      </Section>

      {/* A/S */}
      <Section title="A/S 신청" total={asSummary.total} completed={asSummary.completed}>
        {history.service_requests.length === 0 ? (
          <Empty />
        ) : (
          history.service_requests.map((s: HistoryServiceRequest) => (
            <Link
              key={s.id}
              href={`/admin/service-requests/${s.id}`}
              className="flex items-center gap-3 py-1.5 text-body hover:bg-surface"
            >
              <span className="w-40 shrink-0 font-mono tabular-nums text-text">{s.seq_no}</span>
              <StatusBadge status={s.status} />
              <span className="ml-auto font-mono tabular-nums text-small text-muted">{dateOnly(s.created_at)}</span>
            </Link>
          ))
        )}
      </Section>

      {/* 소모품 */}
      <Section title="소모품 신청" total={supplySummary.total} completed={supplySummary.completed}>
        {history.supply_requests.length === 0 ? (
          <Empty />
        ) : (
          history.supply_requests.map((s: HistorySupplyRequest) => (
            <Link
              key={s.id}
              href={`/admin/supply-requests/${s.id}`}
              className="flex items-center gap-3 py-1.5 text-body hover:bg-surface"
            >
              <span className="w-40 shrink-0 font-mono tabular-nums text-text">{s.seq_no}</span>
              <StatusBadge status={s.status} />
              <span className="text-small text-muted">
                {s.items[0]?.consumable_name_snapshot ?? "-"}
                {s.item_count > 1 && ` 외 ${s.item_count - 1}건`}
              </span>
              <span className="ml-auto font-mono tabular-nums text-small text-muted">{dateOnly(s.created_at)}</span>
            </Link>
          ))
        )}
      </Section>
    </div>
  );
}

interface CompanyEquipmentRow {
  id: string;
  label: string | null;
  serial_no: string | null;
  purchased_at: string | null;
  equipment: { name?: string; model?: string } | null;
}

function equipmentLabel(e: CompanyEquipmentRow): string {
  if (e.equipment?.name) {
    return e.equipment.model ? `${e.equipment.name} (${e.equipment.model})` : e.equipment.name;
  }
  return e.label ?? "(미지정 장비)";
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const dateOnly = (v: string): string => v.slice(0, 10);

function Section({
  title,
  total,
  completed,
  children,
}: {
  title: string;
  total: number;
  completed?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-text">{title}</h2>
        <span className="font-mono tabular-nums text-small text-muted">
          전체 {total}
          {completed !== undefined && <> · 완료 {completed}</>}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="py-1.5 text-small text-muted">내역 없음</p>;
}
