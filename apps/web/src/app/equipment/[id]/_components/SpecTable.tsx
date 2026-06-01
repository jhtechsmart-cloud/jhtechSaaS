import type { SpecGroup } from "@jhtechsaas/shared";
import { SpecGroupIcon } from "@/components/SpecGroupIcon";

// 사양 = 아이콘 그룹별 항목/값. 값은 mono(수치·식별자 정렬). 빈 배열이면 안내 문구.
// 본격적인 2열·아이콘 레이아웃 재구성은 P-A2(공개 상세 재구성)에서 진행.
export function SpecTable({ specs }: { specs: SpecGroup[] }) {
  if (specs.length === 0) {
    return <p className="text-body text-muted">사양 정보 없음</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {specs.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-2">
          {g.group && (
            <div className="flex items-center gap-2 text-text">
              <SpecGroupIcon icon={g.icon} className="h-4 w-4 text-muted" />
              <span className="text-small font-medium">{g.group}</span>
            </div>
          )}
          <table className="w-full border-collapse text-body">
            <tbody>
              {g.items.map((s, i) => (
                <tr key={i} className="border-b border-border">
                  <th className="w-1/3 py-2 pr-4 text-left font-medium text-muted">{s.label}</th>
                  <td className="py-2 font-mono text-text">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
