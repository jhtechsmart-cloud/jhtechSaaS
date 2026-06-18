import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKstKoreanDate, matchEquipmentName, numberToKoreanAmount, parseSpecs, selectPdfSpecItems } from "@jhtechsaas/shared";
import { buildQuotePdf } from "./render-quote-pdf";
import {
  getFontDataUri,
  getStampDataUri,
  getQuoteBgDataUri,
  getCompanyLogoDataUri,
  getCompanyLogoCutterDataUri,
  getCompanyLogoPrinterDataUri,
  getTopBannerDataUri,
  getModelFontDataUri,
} from "./assets";
import { resolveLogoKind, type CategoryLite } from "./logo-kind";
import type { QuoteHtmlData, QuoteHtmlItem, QuoteHtmlIncluded } from "./quote-html";

type QuoteLine = {
  name: string;
  unitPrice: number;
  quantity: number;
  kind?: "included" | "extra";
  equipmentId?: string;
};

// 견적 줄(jsonb) → 타입 보정.
function parseLines(v: unknown): QuoteLine[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      name: typeof r.name === "string" ? r.name : "",
      unitPrice: Number(r.unitPrice) || 0,
      quantity: Number(r.quantity) || 0,
      kind: r.kind === "included" || r.kind === "extra" ? r.kind : undefined,
      equipmentId: typeof r.equipmentId === "string" && r.equipmentId ? r.equipmentId : undefined,
    }));
}

// 스토리지 객체 → base64 data-URI(없으면 null).
async function storageDataUri(
  supabase: SupabaseClient,
  bucket: string,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const ext = path.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// 장비 사양(jsonb SpecGroup[]) 행 — specs 임베드 결과 형식 방어용.
type EquipmentRow = {
  quote_device_image: string | null;
  quote_device_name: string | null;
  specs: unknown;
  category_id: string | null;
};

export async function processQuotePdfJob(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const quoteId = typeof payload.quote_id === "string" ? payload.quote_id : null;
  if (!quoteId) throw new Error("payload.quote_id 누락");

  // 1) 견적 + 신청기업 + 담당자
  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_no, items, options, supply_price, issued_at, application_id, spec_selection, " +
        "assignee:assignee_id(name, phone), application:application_id(company, equipment_id)",
    )
    .eq("id", quoteId)
    .single();
  if (error || !quote) throw new Error(`견적 조회 실패: ${error?.message ?? "없음"}`);

  // 임베디드 select라 supabase-js 추론 타입이 복합형 → unknown 경유 후 레코드로 좁힘(형식 방어).
  const q = quote as unknown as Record<string, unknown>;
  // 임베디드 to-one 관계는 supabase-js가 단일 객체로 추론하지만 런타임 형식 방어 캐스트.
  const app = q.application as { company?: string; equipment_id?: string | null } | null;
  const assignee = q.assignee as { name?: string; phone?: string | null } | null;

  const items = parseLines(q.items);
  const allOptions = parseLines(q.options);
  const includedOptions: QuoteHtmlIncluded[] = allOptions
    .filter((o) => o.kind === "included")
    .map((o) => ({ name: o.name, qtyLabel: `${o.quantity}ea` }));
  const extraOptions: QuoteHtmlItem[] = allOptions
    .filter((o) => o.kind !== "included")
    .map((o) => ({
      name: o.name,
      qtyLabel: `${o.quantity}ea`,
      unitPrice: o.unitPrice,
      amount: o.unitPrice * o.quantity,
    }));
  const htmlItems: QuoteHtmlItem[] = items.map((it) => ({
    name: it.name,
    qtyLabel: it.quantity === 1 ? "1SET" : `${it.quantity}SET`,
    unitPrice: it.unitPrice,
    amount: it.unitPrice * it.quantity,
  }));

  // 2) 장비(사양·로고·장비이미지) 조회 — 우선순위:
  //    ① 견적에서 고른 장비 id(items[0].equipmentId, 견적 수정으로 장비 바꾸면 이게 최신)
  //    ② 폴백: 의뢰 신청 장비(application.equipment_id) — equipmentId 없는 구 견적 하위호환
  //    ③ 폴백: 메인 품목 이름매칭
  const quoteEquipmentId = items[0]?.equipmentId ?? null;
  let equipment: EquipmentRow | null = null;
  for (const eqId of [quoteEquipmentId, app?.equipment_id]) {
    if (equipment || !eqId) continue;
    const { data } = await supabase
      .from("equipment")
      .select("quote_device_name, quote_device_image, specs, category_id")
      .eq("id", eqId)
      .single();
    equipment = data ?? null;
  }
  if (!equipment && items[0]) {
    const { data: all } = await supabase
      .from("equipment")
      .select("id, name, model, quote_device_name, quote_device_image, specs, category_id")
      .eq("status", "active");
    const list = (all ?? []) as (EquipmentRow & { name: string; model: string | null })[];
    const m = matchEquipmentName(items[0].name, list);
    if (m) equipment = m;
  }

  // specs(jsonb) → SpecGroup[](id·pdf 보존, 평면 레거시 하위호환). shared parseSpecs 재사용.
  const rawGroups = parseSpecs(equipment?.specs);

  // 견적 spec_selection(배열) 또는 null(폴백)으로 렌더 항목 선별.
  //   배열 → 그 id만(빈배열=0개) / null → pdf:true만(없으면 전체=현 동작).
  const specSelection = Array.isArray(q.spec_selection)
    ? (q.spec_selection as unknown[]).filter((x): x is string => typeof x === "string")
    : null;
  const specGroups = selectPdfSpecItems(rawGroups, specSelection).map((g) => ({
    group: g.group,
    items: g.items.map((i) => ({ label: i.label, value: i.value })),
  }));

  const supplyPrice = Number(q.supply_price) || 0;
  // issued_at은 UTC ISO — KST 변환 없이 slice하면 KST 자정~09시 발행분이 전날 날짜로 인쇄된다.
  const issued = typeof q.issued_at === "string" ? q.issued_at : null;
  const issuedDateLabel = (issued && formatKstKoreanDate(issued)) || "";

  // 좌상단 회사로고 = 장비 대분류의 quote_logo_kind에 따라 분기.
  //   cutter → 커팅기 로고 / printer → 프린터 로고 / 미설정 → 기본 로고(기존 동작 보존).
  const { data: cats } = await supabase
    .from("equipment_category")
    .select("id, parent_id, quote_logo_kind");
  const logoKind = resolveLogoKind(equipment?.category_id ?? null, (cats ?? []) as CategoryLite[]);
  const companyLogoDataUri =
    logoKind === "cutter"
      ? await getCompanyLogoCutterDataUri()
      : logoKind === "printer"
        ? await getCompanyLogoPrinterDataUri()
        : await getCompanyLogoDataUri();

  const data: QuoteHtmlData = {
    quoteNo: q.quote_no as string,
    issuedDateLabel,
    assigneeName: assignee?.name ?? "담당자",
    assigneePhone: assignee?.phone ?? null,
    recipient: app?.company ?? "고객",
    supplyPrice,
    koreanAmount: numberToKoreanAmount(supplyPrice),
    items: htmlItems,
    includedOptions,
    extraOptions,
    specGroups,
    notes: [
      "상기금액은 부가세(V.A.T) 별도 금액입니다.",
      "본 견적서의 유효기간은 발행일로부터 1개월입니다.",
    ],
    // 상단 헤더 큰 텍스트 = 견적 메인 품목명(첫 품목). 없으면 빈 문자열.
    modelName: htmlItems[0]?.name ?? "",
    modelFontDataUri: await getModelFontDataUri(),
    quoteBgDataUri: await getQuoteBgDataUri(),
    topBannerDataUri: await getTopBannerDataUri(),
    companyLogoDataUri,
    deviceImageDataUri: await storageDataUri(
      supabase,
      "equipment-images",
      equipment?.quote_device_image ?? null,
    ),
    deviceNameDataUri: await storageDataUri(
      supabase,
      "equipment-images",
      equipment?.quote_device_name ?? null,
    ),
    stampDataUri: await getStampDataUri(),
    fontDataUri: await getFontDataUri(),
  };

  // 3) 렌더 → 업로드 → pdf_url
  const pdf = await buildQuotePdf(data);
  const path = `${quoteId}.pdf`;
  const up = await supabase.storage
    .from("quote-pdfs")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`PDF 업로드 실패: ${up.error.message}`);
  const { error: uErr } = await supabase.from("quotes").update({ pdf_url: path }).eq("id", quoteId);
  if (uErr) throw new Error(`pdf_url 기록 실패: ${uErr.message}`);
}
