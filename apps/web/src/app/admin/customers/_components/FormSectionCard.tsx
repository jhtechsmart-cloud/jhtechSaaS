import { Card, CardContent } from "@/components/ui/card";

// 폼 그룹 카드 — 제목(14.5px bold) + 우측 용도 설명(12px 흐림). 상세 페이지 그룹 구조와 1:1.
export function FormSectionCard({
  title,
  purpose,
  fullSpan,
  children,
}: {
  title: string;
  purpose?: string;
  fullSpan?: boolean; // 2열 그리드에서 전체 폭 차지(사업장·장부·메모·보유장비)
  children: React.ReactNode;
}) {
  return (
    <Card className={`gap-0 py-4 shadow-card ${fullSpan ? "min-[860px]:col-span-2" : ""}`}>
      <CardContent className="px-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[14.5px] font-bold text-text">{title}</h2>
          {purpose && <span className="text-small text-muted">{purpose}</span>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
