import { describe, expect, test } from "vitest";
import { avatarInitial, roleLabel, buildAvatarPublicUrl } from "./avatar";

describe("avatarInitial", () => {
  test("이름 첫 글자(한글)", () => {
    expect(avatarInitial("조선제")).toBe("조");
    expect(avatarInitial("Seonje")).toBe("S");
  });
  test("앞뒤 공백 제거 후 첫 글자", () => {
    expect(avatarInitial("  김사원 ")).toBe("김");
  });
  test("없으면 fallback", () => {
    expect(avatarInitial("", "관")).toBe("관");
    expect(avatarInitial(null)).toBe("?");
    expect(avatarInitial(undefined, "영")).toBe("영");
  });
});

describe("roleLabel", () => {
  test("관리자/영업담당", () => {
    expect(roleLabel(true)).toBe("관리자");
    expect(roleLabel(false)).toBe("영업담당");
  });
});

describe("buildAvatarPublicUrl", () => {
  test("public 경로 조립", () => {
    expect(buildAvatarPublicUrl("https://x.supabase.co", "uid/avatar.png")).toBe(
      "https://x.supabase.co/storage/v1/object/public/avatars/uid/avatar.png",
    );
  });
});
