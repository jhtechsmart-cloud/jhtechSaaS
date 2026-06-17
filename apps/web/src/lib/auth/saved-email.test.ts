import { describe, expect, it } from "vitest";
import {
  SAVED_EMAIL_COOKIE,
  buildSavedEmailCookie,
  parseSavedEmail,
} from "./saved-email";

// 로그인 이메일 저장 쿠키의 직렬화/역직렬화 순수 로직.
describe("buildSavedEmailCookie", () => {
  it("저장 체크 + 이메일 있으면 1년짜리 쿠키", () => {
    const cookie = buildSavedEmailCookie("user@jhtech.co.kr", true);
    expect(cookie).toContain(`${SAVED_EMAIL_COOKIE}=`);
    expect(cookie).toContain(encodeURIComponent("user@jhtech.co.kr"));
    expect(cookie).toContain("max-age=31536000");
    expect(cookie).toContain("path=/");
    expect(cookie).toContain("samesite=lax");
  });

  it("이메일 앞뒤 공백은 제거하고 저장", () => {
    const cookie = buildSavedEmailCookie("  a@b.com  ", true);
    expect(cookie).toContain(encodeURIComponent("a@b.com"));
    expect(cookie).not.toContain("%20");
  });

  it("저장 해제면 즉시 만료(삭제) 쿠키", () => {
    const cookie = buildSavedEmailCookie("user@jhtech.co.kr", false);
    expect(cookie).toContain("max-age=0");
    expect(cookie).not.toContain(encodeURIComponent("user@jhtech.co.kr"));
  });

  it("저장 체크라도 이메일이 비어 있으면 삭제 쿠키", () => {
    const cookie = buildSavedEmailCookie("   ", true);
    expect(cookie).toContain("max-age=0");
  });
});

describe("parseSavedEmail", () => {
  it("인코딩된 쿠키 값을 디코드해 반환", () => {
    expect(parseSavedEmail(encodeURIComponent("user@jhtech.co.kr"))).toBe(
      "user@jhtech.co.kr",
    );
  });

  it("값이 없으면 빈 문자열", () => {
    expect(parseSavedEmail(undefined)).toBe("");
    expect(parseSavedEmail("")).toBe("");
  });

  it("디코드 실패(깨진 값)는 빈 문자열로 안전 처리", () => {
    expect(parseSavedEmail("%E0%A4%A")).toBe("");
  });
});
