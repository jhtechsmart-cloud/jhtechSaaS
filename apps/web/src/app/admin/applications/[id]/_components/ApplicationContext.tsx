import { formatBizNo, formatPhone } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApplicationForAdmin } from "@/lib/applications/admin-queries";
import { SURVEY_LABELS, SURVEY_FIELD_LABELS, PHOTO_SLOTS, type PhotoSlot } from "@/lib/applications/schema";
import { ApplicantInfo } from "./quote-frame/ApplicantInfo";
import { InstallSurvey } from "./quote-frame/InstallSurvey";
import { SitePhotos } from "./quote-frame/SitePhotos";

const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  ext_entrance: "외부 진입로",
  ext_building: "외부 건물",
  int_entrance: "내부 입구",
  int_location: "설치 위치",
};

// 견적 작성 화면 좌측 맥락 — 신청기업·설치설문·현장사진.
// 의뢰 상세 페이지의 블록 컴포넌트를 재활용. id로 로드·가공해 서버 렌더.
export async function ApplicationContext({ id }: { id: string }) {
  const r = (await getApplicationForAdmin(id)) as Record<string, unknown> | null;
  if (!r) return null;

  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const companyId = r.company_id as string | null;
  const fields = (r.fields ?? {}) as {
    requirements?: string;
    equipment_name?: string;
    install_survey?: Record<string, string | string[]>;
    photos?: Partial<Record<PhotoSlot, string>>;
  };
  const survey = fields.install_survey ?? {};

  // 신청기업 기본 항목(접수 시 자동 수집분만) — 상세 페이지와 동일 구성.
  const basic: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "회사명", value: str(r.company) },
    { label: "사업자번호", value: formatBizNo(str(r.biz_no) ?? "") || null, mono: true },
    { label: "대표자", value: str(r.ceo) },
    { label: "연락처", value: formatPhone(str(r.phone) ?? "") || null, mono: true },
    { label: "이메일", value: str(r.email) },
    { label: "사업장주소", value: str(r.address) },
    { label: "접수번호", value: str(r.seq_no), mono: true },
  ];

  // 설문 rows — InstallSurvey가 받는 형태로 가공.
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

  // 현장 사진 — 4슬롯 서명URL(경로 정규식 강제: RPC 우회 임의경로 차단).
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
  const sitePhotos = signed
    .filter((s): s is { slot: PhotoSlot; url: string } => s.url !== null)
    .map((s) => ({ slot: s.slot, label: PHOTO_SLOT_LABELS[s.slot], url: s.url }));

  return (
    <>
      <ApplicantInfo
        companyId={companyId}
        basic={basic}
        requirements={fields.requirements ?? null}
        equipmentName={fields.equipment_name ?? null}
      />
      <InstallSurvey rows={surveyRows} extra={surveyExtra} />
      <SitePhotos photos={sitePhotos} />
    </>
  );
}
