import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requirePermission } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServiceRequest, type ServiceRequestStatus } from "@/lib/service-requests/queries";
import { StatusBadge } from "../_components/StatusBadge";
import { StatusControl } from "./_components/StatusControl";
import { MarkReadOnView } from "./_components/MarkReadOnView";

export default async function ServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requirePermission("service_requests.view_all");
  if (access.status === "forbidden") {
    return <p className="text-body text-muted">A/S 조회 권한이 없습니다.</p>;
  }
  const r = (await getServiceRequest(id)) as Record<string, unknown> | null;
  if (!r) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">신청을 찾을 수 없습니다.</p>
        <Link href="/admin/service-requests" className="text-small text-accent">← 목록으로</Link>
      </div>
    );
  }

  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const fields = (r.fields ?? {}) as { symptom?: string; preferred_date?: string; equipment_text?: string; photos?: Record<string, string> };
  const ce = r.company_equipment as { label?: string; equipment?: { name?: string; model?: string } } | null;
  const equipmentLabel = ce?.equipment?.name ?? ce?.label ?? fields.equipment_text ?? null;
  const status = r.status as ServiceRequestStatus;

  // 사진 서명 URL(private 버킷, view_all read 정책으로 서명 가능).
  const supabase = await createSupabaseServerClient();
  const photoPaths = Object.values(fields.photos ?? {}).filter(Boolean);
  const signedPhotos: string[] = [];
  for (const p of photoPaths) {
    const { data } = await supabase.storage.from("customer-uploads").createSignedUrl(p, 600);
    if (data?.signedUrl) signedPhotos.push(data.signedUrl);
  }

  const canManage = can(access.permissions, "service_requests.manage");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <MarkReadOnView id={id} />
      <div className="flex items-center justify-between">
        <Link href="/admin/service-requests" className="text-small text-muted hover:text-text">← 목록</Link>
        <StatusBadge status={status} />
      </div>

      <div>
        <div className="text-small text-muted">접수번호</div>
        <div className="font-mono tabular-nums text-h1 text-text">{str(r.seq_no)}</div>
        {r.company_id == null && (
          <span className="mt-1 inline-block rounded-sm bg-amber-100 px-2 py-0.5 text-small font-medium text-amber-700">
            미확인 고객 — 콜백으로 검증 필요
          </span>
        )}
      </div>

      <Section title="고객 정보">
        <Row label="회사명" value={str(r.contact_company)} />
        <Row label="대표/담당" value={str(r.contact_ceo)} />
        <Row label="연락처" value={str(r.contact_phone)} mono />
        <Row label="이메일" value={str(r.contact_email)} />
        <Row label="주소" value={str(r.contact_address)} />
        <Row label="사업자번호" value={str(r.biz_no)} mono />
        <Row label="담당영업" value={(r.profiles as { name?: string } | null)?.name ?? "미배정"} />
      </Section>

      <Section title="신청 내용">
        <Row label="장비" value={equipmentLabel} />
        <Row label="희망 방문일" value={fields.preferred_date} mono />
        <div className="py-1">
          <div className="text-small text-muted">증상</div>
          <p className="mt-1 whitespace-pre-wrap text-body text-text">{fields.symptom ?? "-"}</p>
        </div>
        {signedPhotos.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {signedPhotos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt={`증상사진 ${i + 1}`} className="aspect-[4/3] w-full rounded-sm object-cover" />
            ))}
          </div>
        )}
      </Section>

      <Section title="처리">
        {canManage ? (
          <StatusControl id={id} current={status} />
        ) : (
          <p className="text-small text-muted">상태 변경 권한(service_requests.manage)이 없습니다.</p>
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
