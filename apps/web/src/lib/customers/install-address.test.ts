import { describe, it, expect } from "vitest";
import { deriveSameAsHq } from "./install-address";

describe("deriveSameAsHq", () => {
  it("설치주소 비면 true", () => expect(deriveSameAsHq("본사", "")).toBe(true));
  it("설치=본사면 true", () => expect(deriveSameAsHq("본사", "본사")).toBe(true));
  it("공백 차이는 무시하고 같으면 true", () => expect(deriveSameAsHq(" 본사 ", "본사")).toBe(true));
  it("본사 쪽 공백 차이도 무시하고 같으면 true", () => expect(deriveSameAsHq("본사 ", "본사")).toBe(true));
  it("다르면 false", () => expect(deriveSameAsHq("본사", "설치")).toBe(false));
  it("본사·설치 모두 비면 true", () => expect(deriveSameAsHq("", "")).toBe(true));
});
