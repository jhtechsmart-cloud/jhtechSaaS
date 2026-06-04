import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requirePermission } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApplicationForAdmin } from "@/lib/applications/admin-queries";
import { listAssignableStaff } from "@/lib/customers/queries";
import { ApplicationStatusBadge } from "@/lib/application-status";
import type { ApplicationStatus } from "@/lib/customers/history";
import { SURVEY_LABELS, SURVEY_FIELD_LABELS, PHOTO_SLOTS, type PhotoSlot } from "@/lib/applications/schema";
import { StatusControl } from "./_components/StatusControl";
import { AssignControl } from "./_components/AssignControl";
import { RegisterCustomerButton } from "./_components/RegisterCustomerButton";

const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  ext_entrance: "외부 진입로",
  ext_building: "외부 건물",
  int_entrance: "내부 입구",
  int_location: "설치 위치",
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requirePermission("applications.view_all");
  if (access.status === "forbidden") {
    return <p className="text-body text-muted">견적 조회 권한이 없습니다.</p>;
  }
  const r = (await getApplicationForAdmin(id)) as Record<string, unknown> | null;
  if (!r) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">신청을 찾을 수 없습니다.</p>
        <Link href="/admin/applications" className="text-small text-accent">← 목록으로</Link>
      </div>
    );
  }

  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const status = r.status as ApplicationStatus;
  const companyId = r.company_id as string | null;
  const fields = (r.fields ?? {}) as {
    requirements?: string;
    equipment_name?: string;
    install_survey?: Record<string, string | string[]>;
    photos?: Partial<Record<PhotoSlot, string>>;
  };
  const survey = fields.install_survey ?? {};
  const staff = await listAssignableStaff();
  const canAssign = can(access.permissions, "applications.assign");
  const canManageCustomers = can(access.permissions, "customers.manage");

  // 사진 4슬롯 — 병렬 서명URL. 실패/없음은 슬롯 라벨 유지하며 플레이스홀더(노출 안 함).
  const supabase = await createSupabaseServerClient();
  const photos = fields.photos ?? {};
  const signed = await Promise.all(
    PHOTO_SLOTS.map(async (slot) => {
      const path = photos[slot];
      if (!path) return { slot, url: null as string | null };
      const { data } = await supabase.storage.from("customer-uploads").createSignedUrl(path, 600);
      return { slot, url: data?.signedUrl ?? null };
    }),
  );
  const hasAnyPhoto = signed.some((s) => s.url);

  // handling 라벨링(배열).
  const handlingArr = Array.isArray(survey.handling) ? (survey.handling as string[]) : [];
  const handlingText = handlingArr
    .map((h) => (SURVEY_LABELS.handling as Record<string, string>)[h] ?? h)
    .join(", ");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/admin/applications" className="text-small text-muted hover:text-text">← 목록</Link>
        <ApplicationStatusBadge status={status} />
      </div>

      <div>
        <div className="text-small text-muted">접수번호</div>
        <div className="font-mono tabular-nums text-h1 text-text">{str(r.seq_no)}</div>
        {!companyId && (
          <span className="mt-1 inline-block rounded-sm bg-amber-100 px-2 py-0.5 text-small font-medium text-amber-700">
            미등록 고객
          </span>
        )}
      </div>

      <Section title="고객 정보">
        {companyId && (
          <Link href={`/admin/customers/${companyId}`} className="mb-1 inline-block text-small font-medium text-accent hover:underline">
            이 고객의 통합 이력 보기 →
          </Link>
        )}
        <Row label="회사명" value={str(r.company)} />
        <Row label="대표자" value={str(r.ceo)} />
        <Row label="연락처" value={str(r.phone)} mono />
        <Row label="이메일" value={str(r.email)} />
        <Row label="주소" value={str(r.address)} />
        <Row label="사업자번호" value={str(r.biz_no)} mono />
        {!companyId && canManageCustomers && (
          <div className="mt-2"><RegisterCustomerButton id={id} /></div>
        )}
      </Section>

      <Section title="요청 내용">
        <Row label="장비" value={fields.equipment_name ?? null} />
        <div className="py-1">
          <div className="text-small text-muted">요청사항</div>
          <p className="mt-1 whitespace-pre-wrap text-body text-text">{fields.requirements || "-"}</p>
        </div>
      </Section>

      <Section title="설치 설문">
        {(["building_type", "location", "elevator", "power", "pneumatic"] as const).map((k) => {
          const raw = survey[k];
          const v = typeof raw === "string" ? raw : "";
          const label = (SURVEY_LABELS[k] as Record<string, string>)[v] ?? (v || "-");
          return <Row key={k} label={SURVEY_FIELD_LABELS[k]} value={label} />;
        })}
        <Row label={SURVEY_FIELD_LABELS.handling} value={handlingText || "-"} />
        {typeof survey.extra === "string" && survey.extra && (
          <div className="py-1">
            <div className="text-small text-muted">기타 요청사항</div>
            <p className="mt-1 whitespace-pre-wrap text-body text-text">{survey.extra}</p>
          </div>
        )}
      </Section>

      {hasAnyPhoto && (
        <Section title="현장 사진">
          <div className="grid grid-cols-2 gap-3">
            {signed.filter((s) => s.url).map((s) => (
              <figure key={s.slot} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url!} alt={PHOTO_SLOT_LABELS[s.slot]} className="aspect-[4/3] w-full rounded-sm object-cover" />
                <figcaption className="text-micro text-muted">{PHOTO_SLOT_LABELS[s.slot]}</figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}

      <Section title="처리">
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 text-small text-muted">담당자</div>
            {canAssign ? (
              <AssignControl id={id} currentAssigneeId={r.assignee_id as string | null} staff={staff} />
            ) : (
              <p className="text-small text-muted">{(r.profiles as { name?: string } | null)?.name ?? "미배정"} (배정 권한 없음)</p>
            )}
          </div>
          <div>
            <div className="mb-1 text-small text-muted">상태</div>
            {canAssign ? (
              <StatusControl id={id} current={status} />
            ) : (
              <p className="text-small text-muted">상태 변경 권한(applications.assign)이 없습니다.</p>
            )}
          </div>
        </div>
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
