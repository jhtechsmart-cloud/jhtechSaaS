// 납품 일정 단일 출처 — 발행 출고의뢰서의 '의뢰별 최신 버전' 설치일시.
// 견적 delivery_date를 대체(설치일시는 출고의뢰서에서 직접 입력). 순수 함수라 단위 테스트 가능.
import { kstDateOf, kstHmOf } from "@/lib/format/kst";

export type RawDeliveryRow = {
  releaseOrderId: string;
  applicationId: string;
  version: number;
  installAt: string | null; // timestamptz ISO(오프셋 포함) | null(미정)
  company: string | null;
};

export type DeliveryRow = {
  releaseOrderId: string;
  applicationId: string;
  installAt: string;
  dateKst: string; // 'YYYY-MM-DD' (KST)
  hmKst: string | null; // 'HH:mm' (KST, 변환 실패만 null)
  company: string | null;
};

// 발행 출고의뢰서 행들 → 의뢰별 최신 버전만 남기고 설치일시를 KST로 변환.
// 최신 버전의 설치일시가 없거나(미정) KST 변환 실패면 제외(납품 일정 없음).
export function pickLatestDeliveries(rows: ReadonlyArray<RawDeliveryRow>): DeliveryRow[] {
  // 1) 의뢰별 최신 버전(version 최대) 선택 — install_at 유무와 무관하게 최신본이 기준.
  const latest = new Map<string, RawDeliveryRow>();
  for (const r of rows) {
    const cur = latest.get(r.applicationId);
    if (!cur || r.version > cur.version) latest.set(r.applicationId, r);
  }
  // 2) 최신본의 설치일시를 KST로 변환(없거나 실패면 드롭).
  const out: DeliveryRow[] = [];
  for (const r of latest.values()) {
    if (!r.installAt) continue;
    const dateKst = kstDateOf(r.installAt);
    if (!dateKst) continue;
    out.push({
      releaseOrderId: r.releaseOrderId,
      applicationId: r.applicationId,
      installAt: r.installAt,
      dateKst,
      hmKst: kstHmOf(r.installAt),
      company: r.company,
    });
  }
  return out;
}
