// #244 미연결 보유장비 안내 — 이력·통계 탭 공용(서버·클라 겸용 순수 표시 컴포넌트).
// 통계는 모수 왜곡 피해가 더 크므로 두 탭 모두에 노출(표본 정직성 — 조용한 누락 금지).
export function UnlinkedBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="rounded-md border border-coral/40 bg-coral-soft px-3 py-2 text-small text-coral-text">
      이 모델과 이름이 일치하지만 카탈로그에 연결되지 않은 보유장비가 {count}건 있습니다 — 해당
      장비의 리포트는 이 집계에 포함되지 않았을 수 있습니다. 정정은 관리자가 고객 상세의
      보유장비에서 카탈로그를 연결하면 됩니다.
    </p>
  );
}
