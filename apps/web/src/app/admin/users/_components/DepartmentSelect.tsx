"use client";
import { DEPARTMENTS } from "@/lib/users/department";

// 부서 select — 영업부/기술부/관리부 + 공란(미지정). 신규·편집 폼 공용.
export function DepartmentSelect({
  value,
  onChange,
  className,
}: {
  value: string; // "" = 미지정
  onChange: (next: string) => void;
  className?: string;
}) {
  return (
    <select
      aria-label="부서"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">(미지정)</option>
      {DEPARTMENTS.map((d) => (
        <option key={d.key} value={d.key}>
          {d.label}
        </option>
      ))}
    </select>
  );
}
