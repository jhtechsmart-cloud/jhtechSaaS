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
import { formatBizNo, formatKstDateTime, formatPhone } from "@jhtechsaas/shared";
import { matchEquipmentName } from "@/lib/quotes/equipment-match";
import { listEquipmentForMatch } from "@/lib/quotes/equipment-match.server";
import type { MatchableEquipmentWithOptions } from "@/lib/quotes/equipment-match.server";
import { QuoteHero } from "./_components/quote-frame/QuoteHero";
import { SectionHeader } from "./_components/quote-frame/SectionHeader";
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

  // 카탈로그 항상 로드 — 견적 item 매칭 + (미발행 시) 요청 장비 미리보기에 사용.
  const catalog = await listEquipmentForMatch();

  // 미발행(견적 없음) = 신청의 "요청 장비"로 화면을 미리 채운다(표시전용, 견적 미생성).
  const isPreview = !quote;

  type LineRow = { name: string; unitPrice: number; quantity: number; kind?: "included" | "extra" };
  let items: LineRow[];
  let optionRows: LineRow[]; // 추가 옵션(과금)
  let includedNames: string[]; // 포함 옵션 이름
  let matched: (MatchableEquipmentWithOptions | null)[];

  if (quote) {
    // 발행/임시 견적 — 저장된 줄을 그대로. 포함옵션은 quote.options(kind=included) 스냅샷에서.
    items = parseQuoteLines(quote.items);
    const allOptions = parseQuoteLines(quote.options);
    optionRows = allOptions.filter((o) => o.kind !== "included");
    includedNames = allOptions.filter((o) => o.kind === "included").map((o) => o.name);
    matched = items.map((it) => matchEquipmentName(it.name, catalog));
  } else {
    // 미발행 — 요청 장비(equipment_id 우선, 없으면 equipment_name 매칭) 1줄을 기본공급가로 미리보기.
    // 포함옵션은 요청 장비의 카탈로그 포함옵션에서(아직 견적 미저장이라 라이브).
    const reqEq =
      (typeof r.equipment_id === "string" ? catalog.find((e) => e.id === r.equipment_id) : undefined) ??
      (fields.equipment_name ? matchEquipmentName(fields.equipment_name, catalog) : null) ??
      null;
    items = reqEq ? [{ name: reqEq.name, unitPrice: reqEq.basePrice, quantity: 1 }] : [];
    optionRows = [];
    includedNames = reqEq ? reqEq.options.filter((o) => o.kind === "included").map((o) => o.name) : [];
    matched = reqEq ? [reqEq] : [];
  }
  // 중복 제거 후 표시용 {name}
  const includedDisplay = Array.from(new Set(includedNames)).map((name) => ({ name }));

  // 소계 헬퍼 — 인라인 계산(DB·RPC 값과 별개, 화면 표시전용)
  const equipmentSubtotal = items.reduce((s, r) => s + r.unitPrice * r.quantity, 0);
  const optionSubtotal = optionRows.reduce((s, r) => s + r.unitPrice * r.quantity, 0);
  // 표시 합계 — 발행 견적은 quote.total(서버 권위), 미발행은 예상(공급가+세액 10% 반올림).
  const previewTotal = equipmentSubtotal + optionSubtotal + Math.round((equipmentSubtotal + optionSubtotal) * 0.1);
  const displayTotal = quote ? quote.total : String(previewTotal);

  // 유효기간 계산
  const validity = quote?.issued_at ? computeQuoteValidity(quote.issued_at, new Date()) : null;

  // 발급일시 문자열 — `2026.06.09 · 14:01` 형식 (UTC ISO → KST 변환, shared 공용)
  const issuedAtLabel = quote?.issued_at ? formatKstDateTime(quote.issued_at) : null;

  // 견적서 PDF 경로(발행 상태만) — 존재 여부가 버튼 활성화 신호.
  // 실제 다운로드는 /admin/quotes/[id]/pdf 라우트가 클릭 시점에 서명URL을 새로 발급(박제 시 10분 만료 문제).
  const pdfPath = quote?.status === "issued" ? (quote.pdf_url ?? null) : null;
  const pdfReady = Boolean(pdfPath);

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

  // 신청기업 정보 — 신청(공개/수기)이 실제 가진 항목만 표시(3열 그리드).
  // 담당자·업태·업종·장부명·전화1/2·팩스·실제주소는 거래처 장부(고객 마스터) 전용 → 견적 화면 미표시.
  type ApplicantField = { label: string; value: string | null; mono?: boolean };
  const basicFields: ApplicantField[] = [
    { label: "회사명", value: str(r.company) },
    { label: "사업자번호", value: formatBizNo(str(r.biz_no) ?? "") || null, mono: true },
    { label: "대표자", value: str(r.ceo) },
    { label: "연락처", value: formatPhone(str(r.phone) ?? "") || null, mono: true },
    { label: "이메일", value: str(r.email) },
    { label: "사업장주소", value: str(r.address) },
    { label: "접수번호", value: str(r.seq_no), mono: true },
  ];

  // 고객등록 버튼 — 미등록 고객 + 권한 있을 때만(신청기업 정보 제목 라인 오른쪽에 배치)
  const registerButton = !companyId && canManageCustomers ? <RegisterCustomerButton id={id} /> : undefined;

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
        total={displayTotal}
        issuedAtLabel={issuedAtLabel}
        unregistered={!companyId}
        preview={isPreview}
      />

      {/* 처리바 — 다른 카드와 동일한 박스 형태. 담당자·상태 변경 컨트롤(배지는 히어로에). */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border/60 bg-surface px-5 py-3 shadow-sm">
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

      {/* 통합 2분할 그리드 — 견적 유무와 무관하게 같은 박스 구성.
          미발행(isPreview)이면 요청 장비로 미리 채우고 우측은 '견적 작성' 유도. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* 좌측 본문 */}
        <div className="flex flex-col gap-6">
          {quotes.length > 0 ? (
            <VersionHistory applicationId={id} quotes={quotes} currentQuoteId={selected!.id} />
          ) : (
            <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
              <SectionHeader title="버전 이력" meta="발행 견적 없음" />
              <div className="rounded-sm bg-surface-2 px-3 py-6 text-center text-small text-muted">
                아직 발행된 견적이 없습니다. 견적을 작성하면 버전 이력이 쌓입니다.
              </div>
            </section>
          )}
          <ApplicantInfo
            companyId={companyId}
            basic={basicFields}
            requirements={fields.requirements ?? null}
            equipmentName={fields.equipment_name ?? null}
            headerAction={registerButton}
          />
          <InstallSurvey rows={surveyRows} extra={surveyExtra} />
          <SitePhotos photos={sitePhotos} />
          <SelectedEquipment
            items={items}
            matched={matched}
            quoteNo={quote ? quote.quote_no : null}
            preview={isPreview}
          />
          <OptionLists included={includedDisplay} extra={optionRows} />
          <SpecialNotesPlaceholder />
        </div>

        {/* 우측 sticky 요약(+영업일지) */}
        <div className="flex flex-col gap-6 self-start lg:sticky lg:top-0">
          <QuoteSummaryPanel
            applicationId={id}
            quoteId={quote ? quote.id : null}
            quoteNo={quote ? quote.quote_no : null}
            statusLabel={quote ? (quote.status === "issued" ? "발행" : "임시") : "미발행"}
            equipmentSubtotal={equipmentSubtotal}
            optionSubtotal={optionSubtotal}
            items={items}
            options={optionRows}
            total={displayTotal}
            preview={isPreview}
            issuedAtLabel={issuedAtLabel}
            validUntilLabel={validity?.validUntilLabel ?? null}
            assigneeName={assigneeName}
            email={str(r.email)}
            phone={formatPhone(str(r.phone) ?? "") || null}
            pdfReady={pdfReady}
            canReissue={canQuote}
            canWrite={canQuote}
            isIssued={quote?.status === "issued"}
            deliveryDate={quote?.delivery_date ?? null}
            deliveryTime={quote?.delivery_time ?? null}
          />
          <SalesLogPlaceholder />
        </div>
      </div>
    </div>
  );
}
