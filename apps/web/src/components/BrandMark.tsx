import Image from "next/image";

// 재현테크 사각 로고 마크(홈페이지 jhtech.co.kr 파비콘과 동일 자산).
// 관리콘솔 사이드바·모바일 드로어·고객센터 상단바의 이름 앞 아이콘 자리에 공용으로 쓴다.
// 장식용이므로 alt는 비움(옆 텍스트가 이름을 담당) — 접근성 이름 중복 방지.
export function BrandMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/jhtech-mark.png"
      alt=""
      width={size}
      height={size}
      priority
      className={`shrink-0 select-none ${className}`}
    />
  );
}
