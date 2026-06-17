// 장비출고의뢰서 details jsonb 스키마 + 프리필 순수 로직. 웹(폼)·서버(RPC 검증)·워커(PDF) 공유.
// 작업 문서라 모든 필드 default → 부분 저장(draft) 허용. device_kind에 따라 printer/cutter 중 하나만 채운다.
import { z } from "zod";

// 종이 양식 고정 체크박스 항목(목업 그대로). 화면 폼·PDF가 공용으로 쓴다(같은 순서·라벨).
export const RELEASE_OPTIONS = {
  printerRip: ["토파즈", "포토프린트", "오닉스"],
  printerColors: ["CMYK", "화이트(W)", "바니쉬"],
  cutterTools: ["기본툴", "RCT(로터리)", "POT(공압진동)", "라우터툴", "라우터매트"],
  cutterCamera: ["내장형", "외부 OCC"],
  cutterExtras: ["링블로워", "에어컴프레서", "컨베이어벨트"],
  transport: ["1톤 리프트 화물차", "윙바디", "카고"],
  electrical: ["케이블", "예비 멀티탭 10m", "컴퓨터용 3구+", "차단기"],
  inboundItems: ["도비바퀴", "자키", "침목", "나무", "랩핑테이프", "리프트", "밧줄"],
  otherPrep: ["회사명판·로고·안전표시", "에어라인(8mm)"],
} as const;

const PrinterDetail = z.object({
  rip: z.string().default(""), // 제공 RIP(토파즈/포토프린트/오닉스)
  headType: z.string().default(""), // 헤드 종류
  headCount: z.string().default(""), // 헤드 수량
  colors: z.array(z.string()).default([]), // 칼라 구성(CMYK/W/바니쉬)
  inkType: z.string().default(""),
  inkQty: z.string().default(""),
});

const CutterDetail = z.object({
  tools: z.array(z.string()).default([]), // 제공 툴
  camera: z.array(z.string()).default([]), // 카메라(내장형/외부OCC)
  extras: z.array(z.string()).default([]), // 기타(링블로워/에어컴프레서/컨베이어벨트)
});

const CommonDetail = z.object({
  testMaterial: z.string().default(""),
  otherSupplies: z.string().default(""),
  computerPrep: z.boolean().default(false),
  dobi: z.boolean().default(false),
  disassemble: z.boolean().default(false),
});

const PrepDetail = z.object({
  transport: z.array(z.string()).default([]), // 운송차량
  inboundItems: z.array(z.string()).default([]), // 입고 준비물
  electrical: z.array(z.string()).default([]), // 전기 사전준비
  otherPrep: z.array(z.string()).default([]), // 기타 준비물
});

const InstallToggle = z.object({
  install: z.boolean().default(false),
  note: z.string().default(""),
});

const SiteDetail = z.object({
  inboundPlan: z.string().default(""), // 장비 입고계획
  doorType: z.string().default(""), // 출입문(도어/창문)
  doorSize: z.string().default(""),
  power: z.string().default(""),
  parking: z.string().default(""),
  // 함수형 default → 중첩 기본값(install/note)까지 채워진다(Zod는 리터럴 default를 재파싱하지 않음).
  blower: InstallToggle.default(() => InstallToggle.parse({})),
  compressor: InstallToggle.default(() => InstallToggle.parse({})),
});

export const ReleaseOrderDetailsSchema = z.object({
  printer: PrinterDetail.nullable().default(null),
  cutter: CutterDetail.nullable().default(null),
  common: CommonDetail.default(() => CommonDetail.parse({})),
  prep: PrepDetail.default(() => PrepDetail.parse({})),
  site: SiteDetail.default(() => SiteDetail.parse({})),
});

export type ReleaseOrderDetails = z.infer<typeof ReleaseOrderDetailsSchema>;

// 설치설문 값 → 사람이 읽는 표기.
const POWER_LABEL: Record<string, string> = { single_220: "단상 220V", triple_380: "삼상 380V" };
const BUILDING_LABEL: Record<string, string> = { factory: "공장", store: "매장", office: "사무실", etc: "기타" };
const LOCATION_LABEL: Record<string, string> = { basement: "지하", ground: "지상", upper: "상층" };

type PrefillInput = {
  application: {
    company?: string | null;
    phone?: string | null;
    address?: string | null;
    fields?: { install_survey?: Record<string, unknown> } | null;
  };
  quote: { items?: unknown; delivery_date?: string | null; delivery_time?: string | null } | null;
  deviceKind: "printer" | "cutter" | null;
};

export type ReleaseOrderPrefill = {
  device_kind: "printer" | "cutter";
  company: string;
  contact_phone: string;
  install_address: string;
  install_at: string | null;
  device_name: string;
  details: ReleaseOrderDetails;
};

// 의뢰·견적·설치설문 → 출고의뢰서 초안. 빈 입력도 안전(빈 기본값).
export function buildReleaseOrderPrefill(input: PrefillInput): ReleaseOrderPrefill {
  const { application, quote, deviceKind } = input;
  const survey = (application.fields?.install_survey ?? {}) as Record<string, unknown>;

  const items = Array.isArray(quote?.items) ? (quote!.items as { name?: unknown }[]) : [];
  const deviceName = typeof items[0]?.name === "string" ? items[0].name : "";

  // 납품일정(date+time) → KST 타임스탬프. 시간 없으면 자정. 날짜 없으면 null.
  const date = quote?.delivery_date ?? null;
  const time = quote?.delivery_time ?? null;
  const install_at = date ? `${date}T${(time ?? "00:00:00").slice(0, 8).padEnd(8, ":00")}+09:00` : null;

  const power = typeof survey.power === "string" ? (POWER_LABEL[survey.power] ?? "") : "";
  const building = typeof survey.building_type === "string" ? (BUILDING_LABEL[survey.building_type] ?? "") : "";
  const loc = typeof survey.location === "string" ? (LOCATION_LABEL[survey.location] ?? "") : "";
  const hasElevator = survey.elevator === "have";
  const inboundPlan = [loc && `${loc} 설치`, hasElevator ? "엘리베이터 있음" : loc ? "엘리베이터 없음" : ""]
    .filter(Boolean)
    .join(" · ");

  const details = ReleaseOrderDetailsSchema.parse({
    printer: null,
    cutter: null,
    site: {
      inboundPlan,
      power,
      parking: building,
    },
    prep: {
      // 전기는 케이블 기본 + 전력 종류 메모 성격으로 케이블만 체크(나머지는 담당자 입력).
      electrical: ["케이블"],
    },
  });

  return {
    device_kind: deviceKind ?? "printer",
    company: application.company ?? "",
    contact_phone: application.phone ?? "",
    install_address: application.address ?? "",
    install_at,
    device_name: deviceName,
    details,
  };
}
