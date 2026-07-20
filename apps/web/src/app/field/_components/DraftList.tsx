"use client";
import { useState } from "react";
import Link from "next/link";
import type { DraftCard } from "@/lib/service-reports/types";
import { deleteDraftAction } from "@/lib/service-reports/actions";

// 작성 중(draft) 리포트 카드 목록 — 이어쓰기 링크 + 삭제(확인 후, 첨부 동반 삭제).
function relativeLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function DraftList({ initial }: { initial: DraftCard[] }) {
  const [list, setList] = useState(initial);
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState("");

  async function remove(d: DraftCard) {
    const who = d.customer_name || "고객 미입력";
    if (!window.confirm(`'${who}' 리포트를 삭제할까요?\n첨부한 사진·서명도 함께 삭제됩니다.`)) return;
    setBusyId(d.id);
    setNote("");
    const res = await deleteDraftAction(d.id);
    setBusyId("");
    if (!res.ok) {
      setNote(res.error);
      return;
    }
    setList((cur) => cur.filter((x) => x.id !== d.id));
  }

  if (list.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-4 text-small text-muted">
        작성 중인 리포트가 없습니다. 새 리포트를 시작하세요.
      </p>
    );
  }

  return (
    <>
      {note && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-small font-medium text-danger">{note}</p>
      )}
      {list.map((d) => (
        <div key={d.id} className="rounded-md border border-border bg-surface p-4 shadow-card">
          <Link href={`/field/report?id=${d.id}`} className="block">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-body font-bold text-text">{d.customer_name || "고객 미입력"}</span>
              {/* 상대시각은 서버·클라 렌더 시점차로 분 단위가 어긋날 수 있음 — 경고 억제 */}
              <span suppressHydrationWarning className="whitespace-nowrap text-micro text-muted">
                {relativeLabel(d.created_at)}
              </span>
            </div>
            <div className="mt-1 text-small text-muted">{d.device_name || "장비 미입력"}</div>
          </Link>
          <div className="mt-2 flex items-center justify-between">
            <Link href={`/field/report?id=${d.id}`} className="text-small font-medium text-accent">
              이어서 작성 →
            </Link>
            <button
              type="button"
              disabled={busyId === d.id}
              onClick={() => void remove(d)}
              className="min-h-11 whitespace-nowrap px-2 text-small text-danger underline disabled:opacity-40"
            >
              {busyId === d.id ? "삭제 중…" : "삭제"}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
