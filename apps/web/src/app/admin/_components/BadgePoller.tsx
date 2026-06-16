"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 사이드바 배지(견적·A/S·소모품)와 종 알림을 주기적으로 갱신.
// 배지 수치는 admin/layout(서버)에서 계산되는데, App Router 레이아웃은 클라 내비로는
// 재실행되지 않아 새 의뢰가 들어와도 새로고침 전엔 안 보인다. router.refresh()로 현재
// 라우트의 서버 컴포넌트를 다시 가져와(RLS 그대로 재실행) 배지를 갱신한다.
// - 탭이 보일 때만 폴링(백그라운드 탭 낭비 방지)
// - 다시 활성화되면 즉시 1회 갱신(돌아오자마자 최신값)
const POLL_MS = 60_000; // 1분

export function BadgePoller() {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, POLL_MS);
    // 숨김→표시 전환 시 즉시 갱신(visibilitychange는 숨길 때도 발화하나 tick이 가시상태만 갱신)
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  return null;
}
