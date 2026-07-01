"use client";
import type { InputHTMLAttributes } from "react";

// 천단위 구분자(3자리마다 쉼표)를 자동으로 표시하는 숫자 입력.
// 내부값은 정수(원·개수), 화면 표시는 ko-KR 로캘 콤마. 빈칸 = NaN(호출부가 그대로 처리).
// type="number"는 콤마를 못 넣으므로 text + inputMode=numeric로 구현(모바일 숫자 키패드 유지).
// 붙여넣기·타이핑 모두 숫자 외 문자는 제거하고 정수만 남긴다.
export function AmountInput({
  value,
  onChange,
  ...rest
}: {
  value: number;
  onChange: (value: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const display = Number.isFinite(value) ? value.toLocaleString("ko-KR") : "";
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, "");
        onChange(digits === "" ? Number.NaN : Number(digits));
      }}
    />
  );
}
