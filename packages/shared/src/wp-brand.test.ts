import { describe, expect, it } from "vitest";
import { WP_BRANDS, WP_BRAND_CATEGORY_IDS, WP_BRAND_LABELS, type WpBrand } from "./wp-brand";

describe("wp-brand", () => {
  it("브랜드 4종이 정의된다", () => {
    expect(WP_BRANDS).toEqual(["flora", "ju", "mutoh", "efi"]);
  });

  it("브랜드→WP 카테고리 매핑이 홈페이지 실측값과 일치한다", () => {
    // jhtech.co.kr WP 카테고리 실측(2026-08-13): FLORA=30·JU SERIES=31·MUTOH=29·EFI 뷰텍=15
    expect(WP_BRAND_CATEGORY_IDS).toEqual({ flora: 30, ju: 31, mutoh: 29, efi: 15 });
  });

  it("모든 브랜드에 카테고리 id와 라벨이 빠짐없이 있다", () => {
    for (const brand of WP_BRANDS) {
      expect(WP_BRAND_CATEGORY_IDS[brand]).toBeGreaterThan(0);
      expect(WP_BRAND_LABELS[brand].length).toBeGreaterThan(0);
    }
  });

  it("카테고리 id가 브랜드 간 중복되지 않는다", () => {
    const ids = Object.values(WP_BRAND_CATEGORY_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("WpBrand 타입이 목록과 일치한다", () => {
    const b: WpBrand = "ju";
    expect(WP_BRANDS.includes(b)).toBe(true);
  });
});
