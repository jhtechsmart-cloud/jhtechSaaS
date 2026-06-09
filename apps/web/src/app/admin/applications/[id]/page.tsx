import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requireApplicationsConsole } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApplicationForAdmin } from "@/lib/applications/admin-queries";
import { claimApplication } from "@/lib/applications/admin-actions";
import { listAssignableStaff } from "@/lib/customers/queries";
import type { ApplicationStatus } from "@/lib/customers/history";
import { SURVEY_LABELS, SURVEY_FIELD_LABELS, PHOTO_SLOTS, type PhotoSlot } from "@/lib/applications/schema";
import { ClaimButton } from "@/app/admin/_components/ClaimButton";
import { StatusControl } from "./_components/StatusControl";
import { AssignControl } from "./_components/AssignControl";
import { RegisterCustomerButton } from "./_components/RegisterCustomerButton";
import { listQuotesForApplication, getQuote } from "@/lib/quotes/queries";
import { pickRepresentativeQuote, computeQuoteValidity } from "@/lib/quotes/banner";
import { parseQuoteLines } from "@/lib/quotes/form";
import { matchEquipmentName } from "@/lib/quotes/equipment-match";
import { listEquipmentForMatch } from "@/lib/quotes/equipment-match.server";
import type { MatchableEquipmentWithOptions, EquipmentOption } from "@/lib/quotes/equipment-match.server";
import { QuoteHero } from "./_components/quote-frame/QuoteHero";
import { VersionHistory } from "./_components/quote-frame/VersionHistory";
import { ApplicantInfo } from "./_components/quote-frame/ApplicantInfo";
import { InstallSurvey } from "./_components/quote-frame/InstallSurvey";
import { SitePhotos } from "./_components/quote-frame/SitePhotos";
import { SelectedEquipment } from "./_components/quote-frame/SelectedEquipment";
import { OptionLists } from "./_components/quote-frame/OptionLists";
import { QuoteSummaryPanel } from "./_components/quote-frame/QuoteSummaryPanel";
import { SpecialNotesPlaceholder, SalesLogPlaceholder } from "./_components/quote-frame/Placeholders";

const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  ext_entrance: "외부 진입로",
  ext_building: "외부 건물",
  int_entrance: "내부 입구",
  int_location: "설치 위치",
};

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

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

  // 권한 계산
  const staff = await listAssignableStaff();
  const canAssign = can(access.permissions, "applications.assign");
  const canClaim = can(access.permissions, "applications.claim");
  const canStatus = can(access.permissions, "applications.status");
  const canManageCustomers = can(access.permissions, "customers.edit");
  const canQuote = can(access.permissions, "quotes.write");

  // 견적 목록 조회
  const quotes = await listQuotesForApplication(id);

  // 표시 견적 선택: ?v=<quoteId>가 유효하면 그 id, 아니면 대표 견적(최신 발행본)
  const vParam = typeof sp.v === "string" ? sp.v : null;
  const selected = vParam && quotes.some((q) => q.id === vParam)
    ? quotes.find((q) => q.id === vParam)!
    : pickRepresentativeQuote(quotes);
  const quote = selected ? await getQuote(selected.id) : null;

  // 장비 매칭 (견적 있을 때만) — item 이름을 카탈로그 name/model과 정규화 대조
  const items = parseQuoteLines(quote?.items);
  const optionRows = parseQuoteLines(quote?.options);
  let matched: (MatchableEquipmentWithOptions | null)[] = [];
  let includedOpts: EquipmentOption[] = [];
  if (quote) {
    const catalog = await listEquipmentForMatch();
    matched = items.map((it) => matchEquipmentName(it.name, catalog));
    includedOpts = matched.flatMap((e) => e?.options.filter((o) => o.kind === "included") ?? []);
  }

  // 소계 헬퍼 — 인라인 계산(DB·RPC 값과 별개, 화면 표시전용)
  const equipmentSubtotal = items.reduce((s, r) => s + r.unitPrice * r.quantity, 0);
  const optionSubtotal = optionRows.reduce((s, r) => s + r.unitPrice * r.quantity, 0);

  // 유효기간 계산
  const validity = quote?.issued_at ? computeQuoteValidity(quote.issued_at, new Date()) : null;

  // 발급일시 문자열 — `2026.06.09 · 14:01` 형식 (KST 보정 없이 slice)
  const issuedAtLabel = quote?.issued_at
    ? `${quote.issued_at.slice(0, 10).replace(/-/g, ".")} · ${quote.issued_at.slice(11, 16)}`
    : null;

  // PDF URL — 발행(issued) 상태인 경우에만 노출
  const pdfUrl = quote?.status === "issued" ? (quote.pdf_url ?? null) : null;

  // 사진 4슬롯 병렬 서명URL
  // ⚠️ anon이 RPC 우회 직접 INSERT로 photos 경로를 주입할 수 있어,
  // RPC와 동일한 경로 정규식(버킷-상대 `<uuid>/<slot>.ext`)을 admin 렌더 전에도 강제.
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

  // 사진 props — SitePhotos가 받는 형태로 가공(url 있는 것만)
  const sitePhotos = signed
    .filter((s): s is { slot: PhotoSlot; url: string } => s.url !== null)
    .map((s) => ({ slot: s.slot, label: PHOTO_SLOT_LABELS[s.slot as PhotoSlot], url: s.url }));

  // 설문 rows — InstallSurvey가 받는 형태로 가공
  const handlingArr = Array.isArray(survey.handling) ? (survey.handling as string[]) : [];
  const handlingText = handlingArr
    .map((h) => (SURVEY_LABELS.handling as Record<string, string>)[h] ?? h)
    .join(", ");

  const surveyRows: { label: string; value: string }[] = [
    ...(["building_type", "location", "elevator", "power", "pneumatic"] as const).map((k) => {
      const raw = survey[k];
      const v = typeof raw === "string" ? raw : "";
      const label = (SURVEY_LABELS[k] as Record<string, string>)[v] ?? (v || "-");
      return { label: SURVEY_FIELD_LABELS[k], value: label };
    }),
    { label: SURVEY_FIELD_LABELS.handling, value: handlingText || "-" },
  ];
  const surveyExtra = typeof survey.extra === "string" && survey.extra ? survey.extra : null;

  // 신청기업 정보 필드 배열 — ApplicantInfo가 받는 형태
  const applicantFields = [
    { label: "회사명", value: str(r.company) },
    { label: "대표자", value: str(r.ceo) },
    { label: "연락처", value: str(r.phone), mono: true },
    { label: "이메일", value: str(r.email) },
    { label: "주소", value: str(r.address) },
    { label: "사업자번호", value: str(r.biz_no), mono: true },
  ];

  // 담당자 이름
  const assigneeName = (r.profiles as { name?: string } | null)?.name ?? null;

  // 처리 바 담당자 컨트롤 — 권한별 분기
  const assigneeNode = canAssign ? (
    // key=서버값 → 배정/상태 auto-bump 후 router.refresh 시 remount해 stale 로컬 state 방지
    <AssignControl
      key={(r.assignee_id as string | null) ?? "none"}
      id={id}
      currentAssigneeId={r.assignee_id as string | null}
      staff={staff}
    />
  ) : r.assignee_id == null && canClaim ? (
    // 영업담당 — 미배정 건을 본인으로 가져오기
    <ClaimButton id={id} action={claimApplication} />
  ) : (
    <span className="text-small text-text">{assigneeName ?? "미배정"}</span>
  );

  return (
    <div>
      {/* 히어로 — 네이비 배경, 견적 식별·상태·4스탯. ApplicationStatusBadge(testid=app-status) 포함. */}
      <QuoteHero
        company={str(r.company) ?? ""}
        status={status}
        seqNo={str(r.seq_no)}
        version={quote ? selected!.version : null}
        quoteNo={quote ? quote.quote_no : null}
        assigneeName={assigneeName}
        validity={validity}
        total={quote?.total ?? null}
        issuedAtLabel={issuedAtLabel}
        unregistered={!companyId}
      />

      {/* 처리바 — 히어로 바로 아래 얇은 1줄. 담당자·상태 변경 컨트롤. 배지는 히어로에 있으므로 여기선 컨트롤만. */}
      <div className="-mx-6 mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-surface/95 px-6 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-small text-muted">담당자</span>
          {assigneeNode}
        </div>
        {canStatus && (
          <div className="flex items-center gap-2">
            <span className="text-small text-muted">상태</span>
            <StatusControl
              key={`${status}-${(r.assignee_id as string | null) ?? "none"}`}
              id={id}
              current={status}
              hasAssignee={r.assignee_id != null}
            />
          </div>
        )}
      </div>

      {quote ? (
        /* 견적 있음 — 2분할 그리드: 좌측 본문 / 우측 320px sticky 요약 */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* 좌측 본문 */}
          <div className="flex flex-col gap-6">
            <VersionHistory
              applicationId={id}
              quotes={quotes}
              currentQuoteId={selected!.id}
            />
            <ApplicantInfo
              companyId={companyId}
              fields={applicantFields}
              requirements={fields.requirements ?? null}
              equipmentName={fields.equipment_name ?? null}
            />
            {!companyId && canManageCustomers && (
              <div className="-mt-4">
                <RegisterCustomerButton id={id} />
              </div>
            )}
            <InstallSurvey rows={surveyRows} extra={surveyExtra} />
            <SitePhotos photos={sitePhotos} />
            <SelectedEquipment
              items={items}
              matched={matched}
              quoteNo={quote.quote_no}
            />
            <OptionLists included={includedOpts} extra={optionRows} />
            <SpecialNotesPlaceholder />
          </div>

          {/* 우측 sticky 요약 패널 */}
          <div className="flex flex-col gap-6">
            <QuoteSummaryPanel
              applicationId={id}
              quoteId={quote.id}
              quoteNo={quote.quote_no}
              statusLabel={quote.status === "issued" ? "발행" : "임시"}
              equipmentSubtotal={equipmentSubtotal}
              optionSubtotal={optionSubtotal}
              total={quote.total}
              issuedAtLabel={issuedAtLabel}
              validUntilLabel={validity?.validUntilLabel ?? null}
              assigneeName={assigneeName}
              email={str(r.email)}
              phone={str(r.phone)}
              pdfUrl={pdfUrl}
              canReissue={canQuote}
            />
            <SalesLogPlaceholder />
          </div>
        </div>
      ) : (
        /* 견적 없음 폴백 — max-w-3xl 단일 컬럼 */
        <div className="flex max-w-3xl flex-col gap-6">
          <ApplicantInfo
            companyId={companyId}
            fields={applicantFields}
            requirements={fields.requirements ?? null}
            equipmentName={fields.equipment_name ?? null}
          />
          {!companyId && canManageCustomers && (
            <div className="-mt-4">
              <RegisterCustomerButton id={id} />
            </div>
          )}
          <InstallSurvey rows={surveyRows} extra={surveyExtra} />
          <SitePhotos photos={sitePhotos} />
          {canQuote && (
            <Link
              href={`/admin/applications/${id}/quote/new`}
              className="inline-block self-start rounded-md bg-accent px-4 py-2 text-small font-medium text-white"
            >
              견적 작성
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
