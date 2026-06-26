"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  createSalesLogAction,
  deleteSalesLogAction,
  fetchSalesLogsForCompanyAction,
} from "@/lib/sales-logs/actions";
import type { SalesLogItem } from "@/lib/sales-logs/queries";

// 영업일지 패널 — 업체별 내부 메모(작성·조회·삭제). 고객 상세 + 견적 작성 화면 공용.
// companyId가 바뀌면(수기견적 고객 선택 등) 해당 업체 일지를 다시 불러온다.
// readOnly=true면 작성·삭제 없이 조회만(견적 화면 참고용 옵션).
function formatKst(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SalesLogPanel({
  companyId,
  currentUserId,
  initialLogs,
  readOnly = false,
}: {
  companyId: string | null;
  currentUserId: string;
  initialLogs?: SalesLogItem[];
  readOnly?: boolean;
}) {
  const [logs, setLogs] = useState<SalesLogItem[]>(initialLogs ?? []);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 초기 companyId에 대해 initialLogs를 이미 받았으면 첫 fetch는 건너뛴다(깜박임 방지).
  const seededFor = useRef<string | null>(initialLogs ? companyId : null);

  useEffect(() => {
    // companyId 없으면 fetch 안 함(렌더가 placeholder로 가려 logs 잔상은 안 보임).
    if (!companyId) return;
    if (seededFor.current === companyId) return; // 서버가 이미 채운 초기값 재사용
    let alive = true;
    fetchSalesLogsForCompanyAction(companyId).then((rows) => {
      if (alive) setLogs(rows);
    });
    return () => {
      alive = false;
    };
  }, [companyId]);

  async function refresh() {
    if (!companyId) return;
    seededFor.current = null; // 강제 재조회 허용
    const rows = await fetchSalesLogsForCompanyAction(companyId);
    setLogs(rows);
    seededFor.current = companyId;
  }

  function add() {
    if (!companyId || draft.trim() === "") return;
    setError(null);
    startTransition(async () => {
      const res = await createSalesLogAction(companyId, draft);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setDraft("");
      await refresh();
    });
  }

  function remove(id: string) {
    if (!companyId) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSalesLogAction(id, companyId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      await refresh();
    });
  }

  return (
    <section className="rounded-md border border-border border-l-4 border-l-accent bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-text">영업일지</h2>
        <span className="text-micro text-muted">내부 메모 · 견적서·고객에 미노출</span>
      </div>

      {!companyId ? (
        <p className="text-small text-muted">고객을 연결하면 영업일지를 작성할 수 있습니다.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {!readOnly && (
            <div className="flex flex-col gap-2">
              <textarea
                aria-label="영업일지 작성"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={pending}
                rows={2}
                placeholder="이 업체 견적 시 참고할 내용을 기록하세요"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text placeholder:text-muted/50"
              />
              <div className="flex items-center justify-between gap-2">
                {error ? <span className="text-small text-danger">{error}</span> : <span />}
                <button
                  type="button"
                  onClick={add}
                  disabled={pending || draft.trim() === ""}
                  className="rounded-md bg-accent px-3 py-1.5 text-small font-medium text-white disabled:opacity-50"
                >
                  기록 추가
                </button>
              </div>
            </div>
          )}

          {logs.length === 0 ? (
            <p className="text-small text-muted">아직 영업일지가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {logs.map((l) => (
                <li key={l.id} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-micro text-muted">
                    <span>
                      {l.author_name ?? "담당자"} · {formatKst(l.created_at)}
                    </span>
                    {!readOnly && l.author_id === currentUserId && (
                      <button
                        type="button"
                        onClick={() => remove(l.id)}
                        disabled={pending}
                        className="text-muted hover:text-danger disabled:opacity-50"
                        aria-label="영업일지 삭제"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-small text-text">{l.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
