import { describe, expect, test } from "vitest";
import { pickLatestDeliveries, type RawDeliveryRow } from "./deliveries-logic";

// 납품 일정 단일 출처 — 의뢰별 최신 발행본 설치일시.
describe("pickLatestDeliveries", () => {
  test("의뢰별 최신 버전만 남기고 설치일시를 KST 날짜·시각으로 변환", () => {
    const rows: RawDeliveryRow[] = [
      { releaseOrderId: "r1", applicationId: "a1", version: 1, installAt: "2026-08-10T09:00:00+09:00", company: "가나" },
      { releaseOrderId: "r2", applicationId: "a1", version: 2, installAt: "2026-08-15T13:30:00+09:00", company: "가나" }, // 최신
      { releaseOrderId: "r3", applicationId: "a2", version: 1, installAt: "2026-08-20T00:00:00+09:00", company: "다라" },
    ];
    const out = pickLatestDeliveries(rows).sort((a, b) => a.applicationId.localeCompare(b.applicationId));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ applicationId: "a1", releaseOrderId: "r2", dateKst: "2026-08-15", hmKst: "13:30", company: "가나" });
    expect(out[1]).toMatchObject({ applicationId: "a2", dateKst: "2026-08-20", hmKst: "00:00", company: "다라" });
  });

  test("UTC 오프셋 ISO도 KST로 환산", () => {
    const out = pickLatestDeliveries([
      { releaseOrderId: "r1", applicationId: "a1", version: 1, installAt: "2026-08-15T04:30:00+00:00", company: null },
    ]);
    expect(out[0]).toMatchObject({ dateKst: "2026-08-15", hmKst: "13:30" });
  });

  test("최신 버전의 설치일시가 미정(null)이면 구버전이 있어도 제외", () => {
    const rows: RawDeliveryRow[] = [
      { releaseOrderId: "r1", applicationId: "a1", version: 1, installAt: "2026-08-10T09:00:00+09:00", company: "가나" },
      { releaseOrderId: "r2", applicationId: "a1", version: 2, installAt: null, company: "가나" }, // 최신=미정
    ];
    expect(pickLatestDeliveries(rows)).toHaveLength(0);
  });

  test("오프셋 없는 잘못된 ISO는 제외(이중 변환 가드)", () => {
    expect(
      pickLatestDeliveries([
        { releaseOrderId: "r1", applicationId: "a1", version: 1, installAt: "2026-08-10 09:00:00", company: null },
      ]),
    ).toHaveLength(0);
  });
});
