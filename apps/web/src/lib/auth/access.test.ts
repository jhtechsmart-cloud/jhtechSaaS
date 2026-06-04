import { describe, it, expect } from "vitest";
import { resolveAccess } from "./access";

describe("resolveAccess", () => {
  it("userId 없으면 unauthenticated", () => {
    expect(resolveAccess(null, null, "equipment.manage")).toEqual({
      status: "unauthenticated",
    });
  });

  it("로그인했으나 권한 없으면 forbidden", () => {
    expect(resolveAccess("u1", ["quotes.write"], "equipment.manage")).toEqual({
      status: "forbidden",
    });
  });

  it("권한 보유 시 ok", () => {
    expect(resolveAccess("u1", ["equipment.manage"], "equipment.manage")).toEqual({
      status: "ok",
    });
  });

  it("users.manage(슈퍼)는 모든 권한 통과", () => {
    expect(resolveAccess("u1", ["users.manage"], "equipment.manage")).toEqual({
      status: "ok",
    });
  });

  it("permissions가 null이면 forbidden(로그인은 됨)", () => {
    expect(resolveAccess("u1", null, "equipment.manage")).toEqual({
      status: "forbidden",
    });
  });

  it("is_active=false면 권한 보유해도 forbidden(비활성 계정 차단)", () => {
    expect(
      resolveAccess("u1", ["equipment.manage"], "equipment.manage", false),
    ).toEqual({ status: "forbidden" });
  });

  it("is_active=false면 users.manage(슈퍼)도 forbidden", () => {
    expect(
      resolveAccess("u1", ["users.manage"], "equipment.manage", false),
    ).toEqual({ status: "forbidden" });
  });
});
