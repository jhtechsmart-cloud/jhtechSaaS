"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBizNo } from "@jhtechsaas/shared";
import { linkApplicationToCompany, type FieldResolution } from "@/lib/applications/admin-actions";
import type { CustomerFieldDiff, ResolvableField } from "@/lib/applications/company-match";

// 견적요청 상세 — 기존 고객 매칭 안내 + 연결 + 필드별 선택 교정 모달.
// biz_no 매치 = 확실(민트 안내), name_only = 오타 의심(코랄 경고). 자동 덮어쓰기 없음.
type Resolution = "keep" | "application" | "company";

export function CustomerMatchPanel({
  applicationId,
  matchKind,
  candidate,
  diffs,
}: {
  applicationId: string;
  matchKind: "biz_no" | "name_only";
  candidate: { id: string; name: string; ceo: string | null; biz_no: string | null };
  diffs: CustomerFieldDiff[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<ResolvableField, Resolution>>(
    () => Object.fromEntries(diffs.map((d) => [d.field, "keep"])) as Record<ResolvableField, Resolution>,
  );

  function submit() {
    setError(null);
    const resolutions: FieldResolution[] = diffs
      .filter((d) => choices[d.field] !== "keep")
      .map((d) => ({ field: d.field, use: choices[d.field] as "application" | "company" }));
    startTransition(async () => {
      const res = await linkApplicationToCompany(applicationId, candidate.id, resolutions);
      if ("error" in res) { setError(res.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  const isBizNo = matchKind === "biz_no";
  return (
    <section
      className={`rounded-lg border p-4 shadow-sm ${isBizNo ? "border-accent-ring/50 bg-mint" : "border-coral/40 bg-coral-soft"}`}
      data-testid="customer-match-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-small text-text">
          {isBizNo ? (
            <>
              <b>사업자번호가 일치하는 기존 고객이 있습니다</b>: {candidate.name}
              {candidate.ceo ? ` (대표 ${candidate.ceo})` : ""}
            </>
          ) : (
            <>
              <b>회사명이 같은 고객이 있습니다(사업자번호 불일치)</b>: {candidate.name}
              {candidate.biz_no ? ` · 사업자번호 ${formatBizNo(candidate.biz_no)}` : " · 사업자번호 미등록"}
              <span className={`ml-1 text-micro ${isBizNo ? "text-muted" : "text-coral-text"}`}>— 입력 오타인지 확인하세요</span>
            </>
          )}{" "}
          <Link href={`/admin/customers/${candidate.id}`} className="underline">
            고객 상세 열기
          </Link>
        </div>
        <button
          onClick={() => (diffs.length > 0 ? setOpen(true) : submit())}
          disabled={pending}
          className="rounded-md border border-accent bg-surface px-2.5 py-1 text-small font-medium text-accent disabled:opacity-60"
        >
          {pending ? "연결 중…" : "이 고객으로 연결"}
        </button>
      </div>
      {error && <p className="mt-1 text-small text-danger">{error}</p>}

      {/* 선택 교정 모달 — 값이 다른 필드만, 필드별 3택(그대로/고객DB 반영/요청 교정) */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="고객 연결 및 정보 교정">
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-card">
            <h2 className="text-h3 font-semibold text-text">고객 연결 — 값이 다른 항목 확인</h2>
            <p className="mt-1 text-small text-muted">
              요청 입력값과 고객DB 값이 다른 항목입니다. 항목별로 어떻게 처리할지 선택하세요(기본: 그대로 두기).
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {diffs.map((d) => (
                <div key={d.field} className="rounded-md border border-border p-3">
                  <div className="text-small font-semibold text-text">{d.label}</div>
                  <div className="mt-1 grid grid-cols-1 gap-1 text-small sm:grid-cols-2">
                    <div className="min-w-0">
                      <span className="text-micro text-muted">요청 입력값</span>
                      <div className="truncate text-text">{d.appValue || <span className="text-muted">(비어 있음)</span>}</div>
                    </div>
                    <div className="min-w-0">
                      <span className="text-micro text-muted">고객DB 값</span>
                      <div className="truncate text-text">{d.companyValue || <span className="text-muted">(비어 있음)</span>}</div>
                    </div>
                  </div>
                  <select
                    aria-label={`${d.label} 처리`}
                    value={choices[d.field]}
                    onChange={(e) => setChoices((prev) => ({ ...prev, [d.field]: e.target.value as Resolution }))}
                    className="mt-2 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-small text-text"
                  >
                    <option value="keep">그대로 두기(양쪽 유지)</option>
                    {d.appValue !== "" && <option value="application">요청값을 고객DB에 반영</option>}
                    {d.companyValue !== "" && <option value="company">고객DB값으로 요청 교정</option>}
                  </select>
                </div>
              ))}
            </div>
            {error && <p className="mt-2 text-small text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-small text-text"
              >
                취소
              </button>
              <button
                onClick={submit}
                disabled={pending}
                className="rounded-md bg-accent px-3 py-1.5 text-small font-semibold text-white disabled:opacity-60"
              >
                {pending ? "연결 중…" : "연결하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
