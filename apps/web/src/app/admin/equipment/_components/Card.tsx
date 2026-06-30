import type { ReactNode } from "react";

// 장비 폼 섹션 카드 — 헤더(제목 + 우측 액션) + 본문. 섹션을 시각적으로 구분한다.
// flex-col이라 grid items-stretch에서 형제 카드와 높이를 맞출 수 있다(포함옵션 동일높이).
export function Card({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-[10px] border border-border bg-surface shadow-sm ${className ?? ""}`}
    >
      {title != null && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3.5 py-2.5">
          <h2 className="text-small font-bold text-text">{title}</h2>
          {action != null && <span className="shrink-0">{action}</span>}
        </div>
      )}
      {/* bodyClassName을 주면 기본 패딩(p-3.5)을 대체 — 스크롤 카드가 패딩을 직접 제어. */}
      <div className={`flex-1 ${bodyClassName ?? "p-3.5"}`}>{children}</div>
    </section>
  );
}

// 섹션 헤더/서브헤더 우측의 '+ 추가' 링크.
export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap text-small font-medium text-accent hover:underline"
    >
      {children}
    </button>
  );
}

// 삭제 = 라벨 버튼(줄바꿈 방지). 기존 텍스트 링크 삭제를 대체.
export function DeleteButton({
  onClick,
  label = "삭제",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-[5px] border border-border bg-surface px-2.5 py-1 text-small font-medium text-danger hover:bg-surface-2 ${className ?? ""}`}
    >
      {label}
    </button>
  );
}
