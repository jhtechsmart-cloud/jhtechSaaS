import { PortalIcon } from "./PortalIcon";

// 푸터 — 회사 정보 + 연락처(서울본사 대표번호·대표 메일).
// 메뉴 링크는 두지 않는다(홈 카드/상단/탭바와 접근명 중복 방지).
export function PortalFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-small text-muted sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-body font-semibold text-text">(주)재현테크</span>
          <span>UV 프린터·커팅기 견적·A/S·소모품 온라인 센터</span>
        </div>
        <div className="flex flex-col gap-2">
          <a href="tel:02-839-7723" className="flex items-center gap-2 hover:text-text">
            <PortalIcon name="phone" size={16} />
            <span className="font-mono tabular-nums">02-839-7723</span>
          </a>
          <a href="mailto:support@jhtech.co.kr" className="flex items-center gap-2 hover:text-text">
            <PortalIcon name="mail" size={16} />
            <span>support@jhtech.co.kr</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
