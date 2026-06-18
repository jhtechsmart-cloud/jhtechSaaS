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
import type { LastSend } from "@/lib/quotes/last-send";
import { listEquipmentForMatch } from "@/lib/quotes/equipment-match.server";
import type { MatchableEquipmentWithOptions } from "@/lib/quotes/equipment-match.server";
import { QuoteHero } from "./_components/quote-frame/QuoteHero";
import { VersionHistory } from "./_components/quote-frame/VersionHistory";
import { VersionDiff } from "./_components/quote-frame/VersionDiff";
import { VersionInfoModal } from "./_components/quote-frame/VersionInfoModal";
import { DeleteQuoteButton } from "./_components/quote-frame/DeleteQuoteButton";
import { diffQuoteVersions } from "@/lib/quotes/diff";
import { buildVersionChip } from "@/lib/quotes/version-chip";
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
  const canDeleteQuote = can(access.permissions, "users.manage");
  const canEmail = can(access.permissions, "email.send");
  const canReleaseOrder = can(access.permissions, "release_orders.write");

  // 견적 목록 조회
  const quotes = await listQuotesForApplication(id);
  // 출고의뢰서는 발행 견적이 전제(I1) — 발행 견적이 있을 때만 진입 노출.
  const hasIssuedQuote = quotes.some((q) => q.status === "issued");

  // 표시 견적 선택: ?v=<quoteId>가 유효하면 그 id, 아니면 대표 견적(최신 발행본)
  const vParam = typeof sp.v === "string" ? sp.v : null;
  const selected = vParam && quotes.some((q) => q.id === vParam)
    ? quotes.find((q) => q.id === vParam)!
    : pickRepresentativeQuote(quotes);
  const quote = selected ? await getQuote(selected.id) : null;

  // 직전 버전(vN-1) 대비 변경 내역 — 현재 보는 버전 기준. v1(직전 없음)이면 미표시.
  const prevQuote = selected ? (quotes.find((q) => q.version === selected.version - 1) ?? null) : null;
  const versionDiff =
    selected && prevQuote
      ? diffQuoteVersions(
          { items: prevQuote.items, options: prevQuote.options },
          { items: selected.items, options: selected.options },
        )
      : null;

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
  // 표시 합계 = 공급가(VAT 별도). 부가세는 화면에 따로 표시하지 않음(견적서 특기사항의 'VAT 별도' 안내로 갈음).
  const displayTotal = quote ? quote.supply_price : String(equipmentSubtotal + optionSubtotal);

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

  // 현재 견적의 최신 메일 발송 상태/대상(배지·재발송 모달용). 발행본만 의미 있음.
  let emailStatus: string | null = null;
  let lastSend: LastSend | null = null;
  if (selected) {
    const { data: el } = await supabase
      .from("email_log")
      .select("status, to_email, created_at")
      .eq("quote_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = el as { status?: string; to_email?: string; created_at?: string } | null;
    emailStatus = row?.status ?? null;
    lastSend =
      row?.to_email && row?.created_at
        ? { to: row.to_email, status: row.status ?? "", at: row.created_at }
        : null;
  }

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
    // 대시보드·고객목록과 동일한 고정폭(1180) 중앙정렬 — 2분할 우측 상세가 화면 따라 늘어나 글자 간격이 벌어지던 문제 해소.
    <div className="mx-auto w-full max-w-[1180px]">
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

      {/* 처리바 — 좌: 버전 칩 + '버전정보' 모달 / 우: 담당자·상태 컨트롤.
          좌·우를 명시 2영역으로 분리(과거 flex-wrap+ml-auto가 정보 길어질 때 컨트롤을 떠밀어 우연히 줄바꿈됨).
          lg 미만에선 의도적으로 세로 stack. 출고의뢰서는 우측 요약 패널 '문서' 영역으로 이동. */}
      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border/60 bg-surface px-5 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {quotes.length > 0 && selected ? (
            <VersionInfoModal
              chip={buildVersionChip(selected)}
              dangerZone={
                canDeleteQuote ? (
                  <DeleteQuoteButton quoteId={selected.id} applicationId={id} multiVersion={quotes.length > 1} />
                ) : null
              }
            >
              <VersionHistory applicationId={id} quotes={quotes} currentQuoteId={selected.id} />
              {versionDiff && prevQuote && (
                <VersionDiff prevVersion={prevQuote.version} currVersion={selected.version} diff={versionDiff} />
              )}
            </VersionInfoModal>
          ) : (
            <span className="text-small text-muted">발행 견적 없음</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:shrink-0">
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
      </div>

      {/* 통합 2분할 그리드 — 견적 유무와 무관하게 같은 박스 구성.
          미발행(isPreview)이면 요청 장비로 미리 채우고 우측은 '견적 작성' 유도. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* 좌측 본문 — 신청기업·신청장비가 먼저 보이게(버전이력·변경내역은 처리바 '버전정보' 모달로 이동). */}
        <div className="flex flex-col gap-6">
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
            canEmail={canEmail}
            emailStatus={emailStatus}
            lastSend={lastSend}
            companyName={str(r.company)}
            canReleaseOrder={canReleaseOrder}
            hasIssuedQuote={hasIssuedQuote}
          />
          <SalesLogPlaceholder />
        </div>
      </div>
    </div>
  );
}
