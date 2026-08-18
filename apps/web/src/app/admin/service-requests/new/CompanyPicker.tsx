"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { formatBizNo } from "@jhtechsaas/shared";
import { searchCompaniesForPicker, type PickerCompany } from "@/lib/service-requests/staff-actions";

// 회사 피커(#281) — 로그인 직원 전용 자동완성. RLS 상속(영업 = 내 담당 고객만).
// 규칙: 최소 2자·debounce 250ms·최대 10건·↑↓ Enter Esc·마지막 응답만 반영·검색 중 스피너·0건 안내(+고객 등록 링크).
const NEW_CUSTOMER_HREF = "/admin/customers/new?return=/admin/service-requests/new";

export function CompanyPicker({
  onSelect,
  autoFocus,
  onNewCustomerClick,
}: {
  onSelect: (company: PickerCompany) => void;
  autoFocus?: boolean;
  onNewCustomerClick?: () => void; // "고객 등록"으로 이탈 직전(증상 초안 보존용)
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PickerCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0); // 요청 레이스 — 마지막 요청의 응답만 반영
  const listId = useId();

  // 디바운스 검색 — 상태 갱신은 응답 도착 시(비동기)에만. 입력 즉시 반응(초기화·스피너)은 onChange가 담당.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const res = await searchCompaniesForPicker(query);
      if (my !== seq.current) return;
      setItems(res);
      setActive(0);
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function onInput(value: string) {
    setQ(value);
    setOpen(true);
    if (value.trim().length < 2) {
      seq.current++; // 진행 중 요청 무효화
      setItems([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  function choose(c: PickerCompany) {
    setOpen(false);
    setQ("");
    setItems([]);
    onSelect(c);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const query = q.trim();
  const showEmpty = open && !loading && query.length >= 2 && items.length === 0;

  return (
    <div className="relative">
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-text">고객사 검색</span>
        <span className="relative">
          <input
            role="combobox"
            aria-label="고객사 검색"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoFocus={autoFocus}
            value={q}
            onChange={(e) => onInput(e.target.value)}
            onFocus={() => items.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            placeholder="회사명·대표·전화번호 2자 이상"
            autoComplete="off"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 pr-9 text-body text-text"
          />
          {loading && (
            <span
              aria-label="검색 중"
              className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-border border-t-accent"
            />
          )}
        </span>
      </label>
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-surface shadow-card"
        >
          {items.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${
                i === active ? "bg-mint" : "hover:bg-mint-hover"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-text">{highlight(c.name, query)}</span>
                <span className="block text-micro text-muted">
                  {c.ceo ? `대표 ${c.ceo}` : ""}
                  {c.phone ? ` · ${c.phone}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="font-mono text-small tabular-nums text-text">
                  {c.biz_no ? formatBizNo(c.biz_no) : <span className="text-muted">번호 없음</span>}
                </span>
                <span className="text-micro text-muted">{c.assignee_name ? `담당 ${c.assignee_name}` : "담당 없음"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {showEmpty && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-surface p-3 text-small text-muted shadow-card">
          &lsquo;{query}&rsquo; 담당 고객 없음 — 내 담당 고객만 검색됩니다 ·{" "}
          <Link
            href={NEW_CUSTOMER_HREF}
            className="font-medium text-accent hover:underline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onNewCustomerClick?.()}
          >
            고객 등록
          </Link>
        </div>
      )}
    </div>
  );
}

// 검색어 하이라이트(대소문자 무시, 첫 일치만).
function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-lime/60 px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
