import { describe, expect, test } from "vitest";
import { summarizeApplications, summarizeRequests } from "./history";

// P-F 섹션 헤더 "전체 N · 완료 M" 파생. 함정: 견적 완료=closed, AS/소모품 완료=done, canceled는 완료 제외.
describe("summarizeApplications — 견적 완료=closed", () => {
  test("closed만 완료로 집계", () => {
    expect(
      summarizeApplications([{ status: "closed" }, { status: "quoted" }, { status: "closed" }]),
    ).toEqual({ total: 3, completed: 2 });
  });
  test("빈 배열 → 0/0", () => {
    expect(summarizeApplications([])).toEqual({ total: 0, completed: 0 });
  });
});

describe("summarizeRequests — AS/소모품 완료=done, canceled 제외", () => {
  test("done만 완료, canceled는 완료 아님", () => {
    expect(
      summarizeRequests([{ status: "done" }, { status: "received" }, { status: "canceled" }, { status: "done" }]),
    ).toEqual({ total: 4, completed: 2 });
  });
  test("빈 배열 → 0/0", () => {
    expect(summarizeRequests([])).toEqual({ total: 0, completed: 0 });
  });
});
