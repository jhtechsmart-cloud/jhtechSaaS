"use client";
import { useMemo } from "react";
import { SALES_PRESET, ADMIN_PRESET, SUPER_PERMISSION } from "@jhtechsaas/shared";
import {
  buildPermissionGroups,
  detectPermissionMode,
  type PermissionMode,
} from "@/lib/users/permissions-ui";

const CARDS: { mode: PermissionMode; label: string; desc: string }[] = [
  { mode: "sales", label: "영업담당", desc: "본인 배정·미배정 건 처리, 견적·메일·고객등록" },
  { mode: "admin", label: "관리자", desc: "모든 권한 (계정·카탈로그·삭제 포함)" },
  { mode: "custom", label: "직접설정", desc: "권한을 개별로 선택" },
];

// 프리셋 = 편집 가능한 시드. 라디오(영업담당/관리자)는 체크 상태를 프리셋으로 세팅할 뿐이고,
// 체크박스 그리드는 모드와 무관하게 항상 펼쳐져 개별 추가/제거가 가능하다.
// 편집으로 프리셋과 달라지면 하이라이트가 '직접설정'으로 이동(detectPermissionMode 파생값).
export function PermissionPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
}) {
  const groups = useMemo(() => buildPermissionGroups(), []);
  const mode = detectPermissionMode(value);

  function selectMode(next: PermissionMode) {
    if (next === "sales") onChange([...SALES_PRESET]);
    else if (next === "admin") onChange([...ADMIN_PRESET]);
    // custom: 현재 value 유지(아래 그리드에서 편집)
  }

  function toggleKey(key: string, checked: boolean) {
    const set = new Set(value);
    if (checked) set.add(key);
    else set.delete(key);
    onChange([...set]);
  }

  const selected = new Set(value);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CARDS.map((card) => (
          <label
            key={card.mode}
            className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 ${
              mode === card.mode
                ? "border-accent bg-accent/5"
                : "border-border bg-surface hover:bg-surface-2"
            }`}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="permission-mode"
                checked={mode === card.mode}
                onChange={() => selectMode(card.mode)}
                className="accent-accent"
              />
              <span className="text-body font-medium text-text">{card.label}</span>
            </span>
            <span className="text-small text-muted">{card.desc}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
        {selected.has(SUPER_PERMISSION) && (
          <p className="rounded-sm bg-surface-2 px-3 py-2 text-small text-muted">
            <span className="font-mono text-micro">{SUPER_PERMISSION}</span> 보유 시 모든
            권한을 통과합니다 — 다른 키를 추가로 체크해도 효과가 없습니다.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.group} className="flex flex-col gap-2">
            <h3 className="text-small font-semibold text-muted">{g.group}</h3>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {g.items.map((item) => (
                <label
                  key={item.key}
                  className="flex items-start gap-2 rounded-sm px-2 py-1 hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.key)}
                    onChange={(e) => toggleKey(item.key, e.target.checked)}
                    className="mt-1 accent-accent"
                  />
                  <span className="flex flex-col">
                    <span className="text-body text-text">{item.label}</span>
                    <span className="font-mono text-micro text-muted">{item.key}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
