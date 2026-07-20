"use client";
import { useState } from "react";

// 년/월/일 셀렉트 날짜 입력 — 캘린더 화살표로 년도를 이동하기 느리다는 현장 요청.
// 셀렉트는 모바일서 네이티브 휠로 열려 원하는 년도로 즉시 점프. 완성된 날짜만 onChange로 방출.
const pad = (n: number) => String(n).padStart(2, "0");

export function DateField({
  value,
  onChange,
  fromYear,
  toYear,
  "aria-label": ariaLabel,
}: {
  value: string; // YYYY-MM-DD 또는 ""
  onChange: (v: string) => void;
  fromYear: number;
  toYear: number;
  "aria-label"?: string;
}) {
  const parse = (v: string): [number, number, number] => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  };
  const [[y, mo, d], setParts] = useState<[number, number, number]>(() => parse(value));
  // 외부 값 변경(장비 선택으로 구매일 프리필 등) 동기화 — 렌더 중 파생(set-state-in-effect 회피).
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setParts(parse(value));
  }

  function update(part: "y" | "m" | "d", n: number) {
    const next: [number, number, number] = [
      part === "y" ? n : y,
      part === "m" ? n : mo,
      part === "d" ? n : d,
    ];
    // 월·년 변경으로 일수가 줄면 말일로 보정
    if (next[0] && next[1] && next[2]) {
      const last = new Date(next[0], next[1], 0).getDate();
      if (next[2] > last) next[2] = last;
    }
    setParts(next);
    if (next[0] && next[1] && next[2]) onChange(`${next[0]}-${pad(next[1])}-${pad(next[2])}`);
    else if (!next[0]) onChange("");
  }

  const years: number[] = [];
  for (let yy = toYear; yy >= fromYear; yy--) years.push(yy);
  const dayCount = y && mo ? new Date(y, mo, 0).getDate() : 31;
  const selectCls =
    "min-h-11 flex-1 rounded-full border border-border bg-surface px-3 py-2.5 text-body text-text";

  return (
    <div className="flex gap-2">
      <select
        aria-label={`${ariaLabel ?? "날짜"} 년`}
        value={y || ""}
        onChange={(e) => update("y", Number(e.target.value) || 0)}
        className={selectCls}
      >
        <option value="">년도</option>
        {years.map((yy) => (
          <option key={yy} value={yy}>
            {yy}년
          </option>
        ))}
      </select>
      <select
        aria-label={`${ariaLabel ?? "날짜"} 월`}
        value={mo || ""}
        onChange={(e) => update("m", Number(e.target.value) || 0)}
        className={selectCls}
      >
        <option value="">월</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => (
          <option key={mm} value={mm}>
            {mm}월
          </option>
        ))}
      </select>
      <select
        aria-label={`${ariaLabel ?? "날짜"} 일`}
        value={d || ""}
        onChange={(e) => update("d", Number(e.target.value) || 0)}
        className={selectCls}
      >
        <option value="">일</option>
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((dd) => (
          <option key={dd} value={dd}>
            {dd}일
          </option>
        ))}
      </select>
    </div>
  );
}
