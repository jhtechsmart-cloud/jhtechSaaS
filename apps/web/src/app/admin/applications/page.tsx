// 의뢰 미선택 상태 — 목록은 layout이 항상 렌더. 여기는 오른쪽 빈 안내만.
export default function ApplicationsIndexPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-h2 font-semibold text-text">의뢰를 선택하세요</p>
      <p className="text-small text-muted">← 왼쪽 목록에서 의뢰 건을 클릭하면 여기에 상세가 표시됩니다.</p>
    </div>
  );
}
