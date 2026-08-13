// #277 장비 브랜드 → WP 브랜드 카테고리 매핑.
// 전체 제품 페이지(/product/)의 포트폴리오 위젯이 브랜드 카테고리 기준으로 필터하므로,
// 자동 동기화 글에 이 카테고리를 달아줘야 목록에 노출된다.
// 번호는 jhtech.co.kr WP 카테고리 실측값(코드 상수 — quote_logo_kind 동형,
// WP에서 해당 카테고리를 삭제/재생성하지 않는 전제).

export const WP_BRANDS = ["flora", "ju", "mutoh", "efi"] as const;
export type WpBrand = (typeof WP_BRANDS)[number];

export const WP_BRAND_CATEGORY_IDS: Record<WpBrand, number> = {
  flora: 30, // FLORA
  ju: 31, // JU SERIES
  mutoh: 29, // MUTOH
  efi: 15, // EFI 뷰텍 시리즈
};

// 관리자 폼 드롭다운 표시용 라벨(홈페이지 카테고리 이름과 동일 표기)
export const WP_BRAND_LABELS: Record<WpBrand, string> = {
  flora: "FLORA",
  ju: "JU SERIES",
  mutoh: "MUTOH",
  efi: "EFI 뷰텍",
};
