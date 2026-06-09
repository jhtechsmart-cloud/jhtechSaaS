import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requireApplicationsConsole } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApplicationForAdmin } from "@/lib/applications/admin-queries";
import { claimApplication } from "@/lib/applications/admin-actions";
import { listAssignableStaff } from "@/lib/customers/queries";
import { ApplicationStatusBadge } from "@/lib/application-status";
import type { ApplicationStatus } from "@/lib/customers/history";
import { SURVEY_LABELS, SURVEY_FIELD_LABELS, PHOTO_SLOTS, type PhotoSlot } from "@/lib/applications/schema";
import { ClaimButton } from "@/app/admin/_components/ClaimButton";
import { StatusControl } from "./_components/StatusControl";
import { AssignControl } from "./_components/AssignControl";
import { RegisterCustomerButton } from "./_components/RegisterCustomerButton";
import { QuotesList } from "./_components/QuotesList";
import { QuoteBanner } from "./_components/QuoteBanner";
import { listQuotesForApplication } from "@/lib/quotes/queries";
import { pickRepresentativeQuote, computeQuoteValidity } from "@/lib/quotes/banner";

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
  const access = await requireApplicationsConsole();
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
  const canClaim = can(access.permissions, "applications.claim");
  const canStatus = can(access.permissions, "applications.status");
  const canManageCustomers = can(access.permissions, "customers.edit");
  const canQuote = can(access.permissions, "quotes.write");
  const quotes = await listQuotesForApplication(id);

  // 사진 4슬롯 — 병렬 서명URL. 실패/없음은 슬롯 라벨 유지하며 플레이스홀더(노출 안 함).
  // ⚠️ anon이 RPC 우회 직접 INSERT로 photos 경로를 주입할 수 있어, RPC와 동일한 경로 정규식
  // (버킷-상대 `<uuid>/<slot>.ext`)을 admin 렌더 전에도 강제(임의경로 서명 방지·방어심화).
  const supabase = await createSupabaseServerClient();
  const photos = fields.photos ?? {};
  const signed = await Promise.all(
    PHOTO_SLOTS.map(async (slot) => {
      const path = photos[slot];
      const pathRe = new RegExp(`^[0-9a-f-]{36}/${slot}\\.(jpe?g|png|webp)$`, "i");
      if (!path || !pathRe.test(path)) return { slot, url: null as string | null };
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

  // 배너 — 대표 견적(최신 발행본 우선) 합계 + 유효기간(발행일+30일, 표시전용).
  const rep = pickRepresentativeQuote(quotes);
  const validity = rep ? computeQuoteValidity(rep.issued_at, new Date()) : null;

  // 상단바 담당자/상태 노드 — 권한별로 컨트롤 또는 읽기전용 표시.
  const assigneeName = (r.profiles as { name?: string } | null)?.name ?? null;
  const assigneeNode = canAssign ? (
    // key=서버값 → 배정/상태 auto-bump 후 router.refresh 시 remount해 stale 로컬 state 방지.
    <AssignControl
      key={(r.assignee_id as string | null) ?? "none"}
      id={id}
      currentAssigneeId={r.assignee_id as string | null}
      staff={staff}
    />
  ) : r.assignee_id == null && canClaim ? (
    // 영업담당 — 미배정 건을 본인으로 가져오기(재배정 권한 없음).
    <ClaimButton id={id} action={claimApplication} />
  ) : (
    <span className="text-small text-text">{assigneeName ?? "미배정"}</span>
  );
  // 배지(색 스파인·권위 상태 readout) + 변경 컨트롤(권한 시). 배지는 항상 노출.
  const statusNode = (
    <div className="flex items-center gap-2">
      <ApplicationStatusBadge status={status} />
      {canStatus && (
        <StatusControl
          key={`${status}-${(r.assignee_id as string | null) ?? "none"}`}
          id={id}
          current={status}
          hasAssignee={r.assignee_id != null}
        />
      )}
    </div>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* 상단바 — 스크롤해도 위에 고정. 좌 식별(접수번호·회사명) / 우 처리(담당자·상태). */}
      <div className="sticky top-0 z-10 -mx-6 -mt-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border bg-surface/95 px-6 py-3 backdrop-blur">
        <div className="min-w-0">
          <div className="font-mono tabular-nums text-small text-muted">{str(r.seq_no)}</div>
          <div className="flex items-center gap-2">
            <span className="truncate text-h2 font-semibold text-text">{str(r.company)}</span>
            {!companyId && (
              <span className="shrink-0 rounded-sm bg-amber-100 px-1.5 py-0.5 text-micro font-medium text-amber-700">
                미등록 고객
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-small text-muted">담당자</span>
            {assigneeNode}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-small text-muted">상태</span>
            {statusNode}
          </div>
        </div>
      </div>

      {/* 배너 — 대표 견적 합계 + 유효기간. */}
      <QuoteBanner total={rep?.total ?? null} validity={validity} isIssued={rep?.status === "issued"} />

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

      <Section title="견적">
        {canQuote && (
          <Link
            href={`/admin/applications/${id}/quote/new`}
            className="mb-3 inline-block rounded-md bg-accent px-3 py-1.5 text-small font-medium text-white"
          >
            견적 작성
          </Link>
        )}
        <QuotesList quotes={quotes} />
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
