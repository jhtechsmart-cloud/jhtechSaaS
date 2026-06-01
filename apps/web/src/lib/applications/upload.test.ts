import { describe, expect, test } from "vitest";
import { buildPhotoPath, PHOTO_SLOT_LABELS } from "./upload";

describe("buildPhotoPath", () => {
  test("버킷-상대 <uuid>/<slot>.<ext> 생성(확장자 소문자)", () => {
    expect(buildPhotoPath("11111111-1111-1111-1111-111111111111", "ext_entrance", "image/jpeg"))
      .toBe("11111111-1111-1111-1111-111111111111/ext_entrance.jpg");
    expect(buildPhotoPath("11111111-1111-1111-1111-111111111111", "int_location", "image/png"))
      .toBe("11111111-1111-1111-1111-111111111111/int_location.png");
    expect(buildPhotoPath("11111111-1111-1111-1111-111111111111", "ext_building", "image/webp"))
      .toBe("11111111-1111-1111-1111-111111111111/ext_building.webp");
  });
  test("허용 외 MIME는 null", () => {
    expect(buildPhotoPath("11111111-1111-1111-1111-111111111111", "ext_building", "image/gif")).toBeNull();
  });
  test("슬롯 라벨 4종 존재", () => {
    expect(Object.keys(PHOTO_SLOT_LABELS)).toHaveLength(4);
  });
});
