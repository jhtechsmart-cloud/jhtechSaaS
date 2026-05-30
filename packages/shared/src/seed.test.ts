import { describe, expect, test } from "vitest";
import { isLocalSupabaseUrl, resolveSeedPassword } from "./seed";

describe("isLocalSupabaseUrl", () => {
  test("로컬 URL은 true", () => {
    expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl("https://foo.local")).toBe(true);
  });
  test("원격(프로덕션) URL은 false", () => {
    expect(isLocalSupabaseUrl("https://okxmeqrvtlvmxfltsara.supabase.co")).toBe(false);
  });
});

describe("resolveSeedPassword — 프로덕션 비번 가드", () => {
  const devDefault = "jhtech-admin-dev";

  test("로컬: env 없으면 dev 기본 비번", () => {
    expect(resolveSeedPassword({ isLocal: true, devDefault })).toBe(devDefault);
  });

  test("로컬: env 있으면 env 우선", () => {
    expect(
      resolveSeedPassword({ isLocal: true, envPassword: "custom-local", devDefault }),
    ).toBe("custom-local");
  });

  test("프로덕션: env 없으면 throw (약한 기본 비번 사용 금지)", () => {
    expect(() => resolveSeedPassword({ isLocal: false, devDefault })).toThrow();
  });

  test("프로덕션: 약한 비번(8자 미만)은 throw", () => {
    expect(() =>
      resolveSeedPassword({ isLocal: false, envPassword: "short", devDefault }),
    ).toThrow();
  });

  test("프로덕션: 8자 이상 강한 비번은 통과", () => {
    const strong = "a-very-strong-prod-password-123";
    expect(
      resolveSeedPassword({ isLocal: false, envPassword: strong, devDefault }),
    ).toBe(strong);
  });
});
