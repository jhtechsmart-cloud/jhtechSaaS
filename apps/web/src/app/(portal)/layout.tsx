import { PortalHeader } from "./_components/PortalHeader";
import { PortalFooter } from "./_components/PortalFooter";
import { PortalTabBar } from "./_components/PortalTabBar";

// 고객 포털 공통 셸 — 모든 공개 페이지(홈·카탈로그·상세·견적·A/S·소모품)에 상단바·하단탭·푸터 적용.
// /login·/admin은 이 라우트 그룹 밖이라 영향 없음. URL은 (portal) 그룹이라 그대로.
// pb-16(모바일): 하단 고정 탭바가 푸터를 가리지 않게 본문 하단 여백 확보. 데스크톱은 제거.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg pb-16 md:pb-0">
      <PortalHeader />
      <div className="flex-1">{children}</div>
      <PortalFooter />
      <PortalTabBar />
    </div>
  );
}
