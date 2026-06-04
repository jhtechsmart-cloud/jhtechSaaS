import { describe, expect, test } from "vitest";
import {
  BUILDING_TYPES, LOCATIONS, ELEVATORS, HANDLING_OPTS, POWERS, PNEUMATICS,
  SURVEY_LABELS,
} from "./schema";

describe("설치설문 라벨맵 — enum 전 항목 커버", () => {
  test("모든 enum 값에 한글 라벨이 있다", () => {
    for (const v of BUILDING_TYPES) expect(SURVEY_LABELS.building_type[v]).toBeTruthy();
    for (const v of LOCATIONS) expect(SURVEY_LABELS.location[v]).toBeTruthy();
    for (const v of ELEVATORS) expect(SURVEY_LABELS.elevator[v]).toBeTruthy();
    for (const v of HANDLING_OPTS) expect(SURVEY_LABELS.handling[v]).toBeTruthy();
    for (const v of POWERS) expect(SURVEY_LABELS.power[v]).toBeTruthy();
    for (const v of PNEUMATICS) expect(SURVEY_LABELS.pneumatic[v]).toBeTruthy();
  });

  test("대표 매핑 — 공개폼과 동일 문구", () => {
    expect(SURVEY_LABELS.building_type.factory).toBe("공장");
    expect(SURVEY_LABELS.power.triple_380).toBe("3상 380V");
    expect(SURVEY_LABELS.handling.ladder).toBe("사다리차 필요");
  });
});
