"use client";
import { countSpecLines, selectPdfSpecItems, type SpecGroup } from "@jhtechsaas/shared";

// 견적서 사양 선택 — 항목별 체크박스 + 한 페이지 하드캡(예산 초과 시 미선택 비활성).
// QuoteForm·ManualQuoteForm 공유. 메인 장비 사양이 없으면(직접입력만) 렌더 안 함.
export function SpecSelectionEditor({
  specs,
  selected,
  setSelected,
  max,
  disabled,
}: {
  specs: SpecGroup[];
  selected: string[];
  setSelected: (next: string[]) => void;
  max: number; // 사양에 쓸 수 있는 최대 줄 수
  disabled?: boolean;
}) {
  if (specs.length === 0) return null;

  // 현재 선택이 차지하는 줄 수(2열 그리드 기준, shared countSpecLines와 동일).
  const used = countSpecLines(selectPdfSpecItems(specs, selected));
  const full = used >= max;

  function toggle(id: string, checked: boolean) {
    if (checked) setSelected([...selected, id]);
    else setSelected(selected.filter((x) => x !== id));
  }

  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-h2 font-medium text-text">견적서 사양 선택</h2>
        <span className={`text-small ${used > max ? "text-danger" : "text-muted"}`}>
          한 페이지 예산: {used}/{max}줄
        </span>
      </div>
      {used > max && (
        <p className="mb-2 text-small text-danger">사양이 한 페이지를 넘칩니다. 일부 항목을 해제하세요.</p>
      )}
      <div className="flex flex-col gap-3">
        {specs.map((g) => (
          <div key={g.group} className="flex flex-col gap-1">
            {g.group && <div className="text-small font-semibold text-text">{g.group}</div>}
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {g.items.map((i) => {
                const checked = selected.includes(i.id);
                // 하드캡: 미선택 항목은 예산이 다 차면 비활성(이미 선택된 것은 항상 해제 가능).
                const blocked = !checked && full;
                return (
                  <label key={i.id} className={`flex items-center gap-2 text-body ${blocked ? "opacity-40" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || blocked}
                      onChange={(e) => toggle(i.id, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="text-muted">{i.label}</span>
                    <span className="font-mono text-text">{i.value}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
