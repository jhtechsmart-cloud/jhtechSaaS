import Link from "next/link";

// 재사용 CTA — 홈/추후 랜딩에서 카탈로그로 유도. accent 버튼(DESIGN.md).
export function CatalogButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/equipment"
      className={`inline-flex items-center justify-center rounded-md bg-accent px-5 py-3 text-body font-medium text-white ${className}`}
    >
      장비 카탈로그 보기
    </Link>
  );
}
