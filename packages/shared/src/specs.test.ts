import { describe, it, expect } from "vitest";
import { parseSpecs, serializeSpecs, type Spec } from "./specs";

describe("parseSpecs", () => {
  it("정상 배열을 그대로 반환", () => {
    const input = [{ label: "전압", value: "220V" }];
    expect(parseSpecs(input)).toEqual(input);
  });
  it("레거시 빈 객체 {}는 빈 배열로", () => {
    expect(parseSpecs({})).toEqual([]);
  });
  it("null/undefined는 빈 배열로", () => {
    expect(parseSpecs(null)).toEqual([]);
    expect(parseSpecs(undefined)).toEqual([]);
  });
  it("label/value 없는 항목은 제외", () => {
    expect(parseSpecs([{ label: "ok", value: "1" }, { foo: "bar" }])).toEqual([
      { label: "ok", value: "1" },
    ]);
  });
  it("label·value를 문자열로 강제", () => {
    expect(parseSpecs([{ label: 1, value: 2 }])).toEqual([
      { label: "1", value: "2" },
    ]);
  });
});

describe("serializeSpecs", () => {
  it("빈 항목(label·value 모두 공백)은 제거", () => {
    const input: Spec[] = [
      { label: "전압", value: "220V" },
      { label: "", value: "" },
    ];
    expect(serializeSpecs(input)).toEqual([{ label: "전압", value: "220V" }]);
  });
  it("label/value 트림", () => {
    expect(serializeSpecs([{ label: " 전압 ", value: " 220V " }])).toEqual([
      { label: "전압", value: "220V" },
    ]);
  });
});
