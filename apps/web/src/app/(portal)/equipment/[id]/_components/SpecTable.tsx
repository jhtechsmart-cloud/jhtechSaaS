import type { SpecGroup } from "@jhtechsaas/shared";
import { SpecGroupIcon } from "@/components/SpecGroupIcon";

// 사양 = 아이콘 그룹별 항목/값. 값은 mono. 빈 배열이면 안내.
export function SpecTable({ specs }: { specs: SpecGroup[] }) {
  if (specs.length === 0) return <p className="text-body text-muted">사양 정보 없음</p>;
  return (
    <div className="flex flex-col gap-8">
      {specs.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-3">
          {g.group && (
            <div className="flex items-center gap-2 text-text">
              <SpecGroupIcon icon={g.icon} className="h-5 w-5 text-accent" />
              <span className="text-h2 font-medium">{g.group}</span>
            </div>
          )}
          <table className="w-full border-collapse text-body">
            <tbody>
              {g.items.map((s, i) => (
                <tr key={i} className="border-b border-border">
                  <th className="w-1/3 py-2.5 pr-4 text-left font-medium text-muted">{s.label}</th>
                  <td className="py-2.5 font-mono text-text">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
