import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requirePermission } from "@/lib/auth/guard";
import { getSupplyRequest, type SupplyRequestStatus } from "@/lib/supply-requests/queries";
import { StatusBadge } from "@/lib/request-status";
import { StatusControl } from "./_components/StatusControl";
import { MarkReadOnView } from "./_components/MarkReadOnView";

export default async function SupplyRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requirePermission("supply_requests.view_all");
  if (access.status === "forbidden") {
    return <p className="text-body text-muted">소모품신청 조회 권한이 없습니다.</p>;
  }
  const r = (await getSupplyRequest(id)) as Record<string, unknown> | null;
  if (!r) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">신청을 찾을 수 없습니다.</p>
        <Link href="/admin/supply-requests" className="text-small text-accent">← 목록으로</Link>
      </div>
    );
  }

  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const company = r.companies as { name?: string; biz_no?: string; ceo?: string; phone?: string } | null;
  const items = (r.supply_request_items as Array<{ id: string; consumable_name_snapshot: string; consumable_unit_snapshot: string | null; qty: number }> | null) ?? [];
  const status = r.status as SupplyRequestStatus;
  const canManage = can(access.permissions, "supply_requests.manage");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <MarkReadOnView id={id} />
      <div className="flex items-center justify-between">
        <Link href="/admin/supply-requests" className="text-small text-muted hover:text-text">← 목록</Link>
        <StatusBadge status={status} />
      </div>

      <div>
        <div className="text-small text-muted">접수번호</div>
        <div className="font-mono tabular-nums text-h1 text-text">{str(r.seq_no)}</div>
      </div>

      <Section title="고객 정보">
        {r.company_id != null && (
          <Link
            href={`/admin/customers/${r.company_id}`}
            className="mb-1 inline-block text-small font-medium text-accent hover:underline"
          >
            이 고객의 통합 이력 보기 →
          </Link>
        )}
        <Row label="업체명" value={company?.name ?? null} />
        <Row label="대표" value={company?.ceo ?? null} />
        <Row label="사업자번호" value={company?.biz_no ?? null} mono />
        <Row label="업체 연락처" value={company?.phone ?? null} mono />
        <Row label="신청자" value={str(r.requester_name)} />
        <Row label="신청자 연락처" value={str(r.requester_phone)} mono />
        <Row label="담당영업" value={(r.profiles as { name?: string } | null)?.name ?? "미배정"} />
      </Section>

      <Section title="신청 소모품">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-border text-left text-small text-muted">
              <th className="py-1 pr-4 font-medium">소모품</th>
              <th className="py-1 font-medium">수량</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-border last:border-b-0">
                <td className="py-1.5 pr-4 text-text">
                  {it.consumable_name_snapshot}
                  {it.consumable_unit_snapshot && <span className="ml-1 text-small text-muted">({it.consumable_unit_snapshot})</span>}
                </td>
                <td className="py-1.5 font-mono tabular-nums text-text">{it.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {str(r.note) && (
          <div className="mt-3">
            <div className="text-small text-muted">요청 메모</div>
            <p className="mt-1 whitespace-pre-wrap text-body text-text">{str(r.note)}</p>
          </div>
        )}
      </Section>

      <Section title="처리">
        {canManage ? (
          <StatusControl id={id} current={status} />
        ) : (
          <p className="text-small text-muted">상태 변경 권한(supply_requests.manage)이 없습니다.</p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-2 text-h2 font-medium text-text">{title}</h2>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-3 py-1 text-body">
      <span className="w-24 shrink-0 text-small text-muted">{label}</span>
      <span className={`text-text ${mono ? "font-mono tabular-nums" : ""}`}>{value || "-"}</span>
    </div>
  );
}
