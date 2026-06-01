"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBizNo } from "@jhtechsaas/shared";
import { searchApplicationsAction, registerFromApplication } from "@/lib/customers/actions";

// 견적 신청 검색 결과 행 타입 — RPC search_applications_for_customer 반환 형태.
type ApplicationRow = {
  application_id: string;
  company_name: string | null;
  biz_no: string | null;
  seq_no: string | null;
  phone: string | null;
};

// ApplicationPicker — 견적 신청을 검색하여 고객으로 자동 등록.
// 2자 미만 입력은 무시. 3가지 상태: pre-search / 0결과 / 결과 목록.
export function ApplicationPicker() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ApplicationRow[] | null>(null); // null = pre-search
  const [searching, startSearch] = useTransition();
  const [registering, startRegister] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSearch(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      setResults(null); // 2자 미만 → pre-search 상태
      return;
    }
    setError(null);
    startSearch(async () => {
      const data = await searchApplicationsAction(value.trim());
      if (!Array.isArray(data)) {
        // { error } 반환 시
        setError((data as { error: string }).error);
        return;
      }
      setResults(data as ApplicationRow[]);
    });
  }

  function handleSelect(applicationId: string) {
    setError(null);
    startRegister(async () => {
      const result = await registerFromApplication(applicationId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const { company_id, created } = result;
      router.push(
        `/admin/customers/${company_id}/edit?registered=${created ? "new" : "existing"}`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        value={q}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="업체명·사업자번호·접수번호로 검색"
        className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      />

      {error ? <p className="text-small text-danger">{error}</p> : null}

      {/* pre-search: 안내 메시지 */}
      {results === null && !searching && (
        <p className="text-small text-muted">업체명·사업자번호·접수번호로 견적요청 검색</p>
      )}

      {/* 검색 중 */}
      {searching && (
        <p className="text-small text-muted">검색 중…</p>
      )}

      {/* 0 결과 */}
      {results !== null && results.length === 0 && !searching && (
        <div className="flex flex-col gap-2">
          <p className="text-small text-muted">
            일치하는 견적요청이 없습니다 — 직접 입력으로 등록하세요
          </p>
          <Link href="?mode=direct" className="text-small text-accent underline">
            직접 입력으로 전환
          </Link>
        </div>
      )}

      {/* 결과 목록 */}
      {results !== null && results.length > 0 && !searching && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border text-left text-small text-muted">
                <th className="py-2 font-medium">업체명</th>
                <th className="py-2 font-medium">사업자번호</th>
                <th className="py-2 font-medium">접수번호</th>
                <th className="py-2 font-medium">연락처</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr
                  key={row.application_id}
                  className="border-b border-border hover:bg-surface-2"
                >
                  <td className="py-2 text-text">{row.company_name ?? "-"}</td>
                  <td className="py-2 font-mono tabular-nums text-text">
                    {row.biz_no ? (
                      formatBizNo(row.biz_no)
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="py-2 font-mono tabular-nums text-muted">
                    {row.seq_no ?? "-"}
                  </td>
                  <td className="py-2 text-muted">{row.phone ?? "-"}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => handleSelect(row.application_id)}
                      disabled={registering}
                      className="rounded-sm bg-accent px-2 py-1 text-small font-medium text-white disabled:opacity-60"
                    >
                      {registering ? "등록 중…" : "선택"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
