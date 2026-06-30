import "server-only";
import { buildReleaseOrderPrefill, ReleaseOrderDetailsSchema, type ReleaseOrderDetails } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ReleaseOrderFormData = {
  applicationId: string;
  // 자동채움 표시값(서버 권위 — 폼은 읽기전용으로 보여줌, 저장 시 RPC가 다시 채움).
  company: string;
  contactPhone: string;
  installAddress: string;
  deviceName: string;
  installAt: string | null;
  hasIssuedQuote: boolean;
  // 최신 출고의뢰서 버전(편집 대상). 없으면 신규(프리필).
  releaseOrder: { id: string; status: "draft" | "issued"; version: number } | null;
  pdfReady: boolean; // 최신 발행본 PDF 생성 완료(다운로드 버튼 활성화)
  // 버전 이력(최신순) — 각 버전 상태·발행일·PDF 보유 여부.
  versions: ReleaseOrderVersion[];

  deviceKind: "printer" | "cutter";
  details: ReleaseOrderDetails;
};

export type ReleaseOrderVersion = {
  id: string;
  version: number;
  status: "draft" | "issued";
  issuedAt: string | null;
  createdAt: string;
  hasPdf: boolean;
};

// 견적 장비의 대분류 quote_logo_kind로 device_kind 자동판별(best-effort).
// 워커 resolveLogoKind와 같은 규칙(소분류면 부모 대분류 값). 미설정/미존재면 null → 폼은 printer 기본.
async function resolveDeviceKindFromQuote(
  supabase: SupabaseServer,
  items: unknown,
): Promise<"printer" | "cutter" | null> {
  const arr = Array.isArray(items) ? (items as { equipmentId?: unknown }[]) : [];
  const eqId = arr[0]?.equipmentId;
  if (typeof eqId !== "string") return null;
  const { data: eq } = await supabase.from("equipment").select("category_id").eq("id", eqId).maybeSingle();
  const catId = (eq as { category_id?: string | null } | null)?.category_id ?? null;
  if (!catId) return null;
  const { data: cat } = await supabase
    .from("equipment_category")
    .select("parent_id, quote_logo_kind")
    .eq("id", catId)
    .maybeSingle();
  const c = cat as { parent_id?: string | null; quote_logo_kind?: string | null } | null;
  if (!c) return null;
  if (c.quote_logo_kind === "printer" || c.quote_logo_kind === "cutter") return c.quote_logo_kind;
  if (c.parent_id) {
    const { data: parent } = await supabase
      .from("equipment_category")
      .select("quote_logo_kind")
      .eq("id", c.parent_id)
      .maybeSingle();
    const k = (parent as { quote_logo_kind?: string | null } | null)?.quote_logo_kind;
    if (k === "printer" || k === "cutter") return k;
  }
  return null;
}

// 작성 폼 데이터 적재 — 의뢰 + 최신 발행견적 + 기존 출고의뢰서 → 자동채움값·프리필·기존값.
export async function loadReleaseOrderForForm(applicationId: string): Promise<ReleaseOrderFormData | null> {
  const supabase = await createSupabaseServerClient();
  const { data: app } = await supabase
    .from("applications")
    .select("company, phone, address, fields")
    .eq("id", applicationId)
    .single();
  if (!app) return null;

  const { data: quote } = await supabase
    .from("quotes")
    .select("items, delivery_date, delivery_time")
    .eq("application_id", applicationId)
    .eq("status", "issued")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 모든 버전(최신순). 최신 버전 = 편집 대상, 나머지는 이력.
  const { data: rows } = await supabase
    .from("release_orders")
    .select("id, version, status, device_kind, details, pdf_url, company, contact_phone, install_address, install_at, device_name, issued_at, created_at")
    .eq("application_id", applicationId)
    .order("version", { ascending: false });
  const allRows = (rows ?? []) as {
    id: string;
    version: number;
    status: "draft" | "issued";
    device_kind: string;
    details: unknown;
    pdf_url: string | null;
    company: string | null;
    contact_phone: string | null;
    install_address: string | null;
    install_at: string | null;
    device_name: string | null;
    issued_at: string | null;
    created_at: string;
  }[];
  const ro = allRows[0] ?? null; // 최신 버전
  const versions: ReleaseOrderVersion[] = allRows.map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status,
    issuedAt: r.issued_at,
    createdAt: r.created_at,
    hasPdf: r.status === "issued" && !!r.pdf_url,
  }));

  // device_kind: 기존 출고서 우선 → 견적 장비 대분류 → printer 폴백.
  let deviceKind: "printer" | "cutter" = "printer";
  if (ro?.device_kind === "printer" || ro?.device_kind === "cutter") {
    deviceKind = ro.device_kind;
  } else {
    deviceKind = (await resolveDeviceKindFromQuote(supabase, (quote as { items?: unknown } | null)?.items)) ?? "printer";
  }

  const prefill = buildReleaseOrderPrefill({
    application: {
      company: app.company as string | null,
      phone: app.phone as string | null,
      address: app.address as string | null,
      fields: app.fields as { install_survey?: Record<string, unknown> } | null,
    },
    quote: (quote as { items?: unknown; delivery_date?: string | null; delivery_time?: string | null } | null) ?? null,
    deviceKind,
  });

  // 기존 draft가 있으면 저장된 details, 없으면 설문 기반 프리필.
  const details = ro ? ReleaseOrderDetailsSchema.parse(ro.details) : prefill.details;

  // 프리필 — 기존 출고의뢰서에 저장된(편집된) 값 우선, 없으면 견적/application 기반 프리필.
  // 장비명·설치일시도 이제 출고의뢰서가 보존하는 편집 가능 값(견적은 최초 진입 폴백).
  return {
    applicationId,
    company: ro?.company ?? prefill.company,
    contactPhone: ro?.contact_phone ?? prefill.contact_phone,
    installAddress: ro?.install_address ?? prefill.install_address,
    deviceName: ro?.device_name ?? prefill.device_name,
    installAt: ro?.install_at ?? prefill.install_at,
    hasIssuedQuote: !!quote,
    releaseOrder: ro ? { id: ro.id, status: ro.status, version: ro.version } : null,
    pdfReady: !!ro && ro.status === "issued" && !!ro.pdf_url,
    versions,
    deviceKind,
    details,
  };
}
