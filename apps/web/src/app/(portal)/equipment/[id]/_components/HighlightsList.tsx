// 요약(highlights) 불릿 — accent 마커. 빈 배열이면 렌더 안 함.
export function HighlightsList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-h2 font-medium text-text">요약</span>
      <ul className="flex flex-col gap-2">
        {items.map((h, i) => (
          <li key={i} className="relative pl-5 text-body text-text">
            <span className="absolute left-0 font-bold text-accent">›</span>
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}
