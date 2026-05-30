import { describe, it, expect } from "vitest";
import {
  validateImageFile,
  equipmentImageObjectPath,
  buildPublicImageUrl,
  MAX_IMAGE_BYTES,
} from "./images";

describe("validateImageFile", () => {
  it("jpg/png/webp 5MB 이하 통과", () => {
    expect(validateImageFile({ type: "image/jpeg", size: 1000, name: "a.jpg" })).toEqual({ ok: true });
    expect(validateImageFile({ type: "image/png", size: 1000, name: "a.png" }).ok).toBe(true);
    expect(validateImageFile({ type: "image/webp", size: 1000, name: "a.webp" }).ok).toBe(true);
  });
  it("비허용 형식 거부", () => {
    const r = validateImageFile({ type: "image/gif", size: 1000, name: "a.gif" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("a.gif");
  });
  it("5MB 초과 거부", () => {
    const r = validateImageFile({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1, name: "big.jpg" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("5MB");
  });
});

describe("equipmentImageObjectPath", () => {
  it("equipment/{id}/{uuid}.{ext} 형식", () => {
    const p = equipmentImageObjectPath("eq-1", { type: "image/png" }, "uuid-9");
    expect(p).toBe("equipment/eq-1/uuid-9.png");
  });
  it("jpeg→jpg, webp→webp", () => {
    expect(equipmentImageObjectPath("e", { type: "image/jpeg" }, "u")).toBe("equipment/e/u.jpg");
    expect(equipmentImageObjectPath("e", { type: "image/webp" }, "u")).toBe("equipment/e/u.webp");
  });
});

describe("buildPublicImageUrl", () => {
  it("Storage public 객체 URL 빌드", () => {
    expect(buildPublicImageUrl("https://x.supabase.co", "equipment/e/u.jpg")).toBe(
      "https://x.supabase.co/storage/v1/object/public/equipment-images/equipment/e/u.jpg",
    );
  });
});
