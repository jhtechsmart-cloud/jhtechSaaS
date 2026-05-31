import type { Spec } from "@jhtechsaas/shared";

// 사양 테이블 — 항목/값. 값은 mono(수치·식별자 정렬). 빈 배열이면 안내 문구.
export function SpecTable({ specs }: { specs: Spec[] }) {
  if (specs.length === 0) {
    return <p className="text-body text-muted">사양 정보 없음</p>;
  }
  return (
    <table className="w-full border-collapse text-body">
      <tbody>
        {specs.map((s, i) => (
          <tr key={i} className="border-b border-border">
            <th className="w-1/3 py-2 pr-4 text-left font-medium text-muted">{s.label}</th>
            <td className="py-2 font-mono text-text">{s.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
