"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DURATION_OPTIONS,
  type DurationOption,
} from "@/lib/demo-reservations/constants";
import { computeSelection } from "@/lib/demo-reservations/slots";
import { createReservationSchema } from "@/lib/demo-reservations/schema";
import { createDemoReservation } from "@/lib/demo-reservations/actions";
import type {
  DemoReservationRow,
  EquipmentOptionRow,
} from "@/lib/demo-reservations/queries";
import { CustomerCombobox } from "./CustomerCombobox";
import { TimeSlotPicker } from "./TimeSlotPicker";

// 예약 등록 폼 — 슬롯 선택·소요시간·충돌 판정은 순수 로직(slots.ts) 재사용.
// 충돌/운영시간 초과 시 경고 배너 + 저장 비활성(1차), 서버 zod(2차), DB EXCLUDE(3차).

const INPUT_CLS =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text placeholder:text-muted/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-small font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function NewReservationForm({
  date,
  onDateChange,
  equipmentOptions,
  reservations,
  loading,
  onSaved,
}: {
  date: string;
  onDateChange: (date: string) => void;
  equipmentOptions: EquipmentOptionRow[];
  reservations: DemoReservationRow[];
  loading: boolean;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customer, setCustomer] = useState({ companyId: null as string | null, customerName: "" });
  const [equipmentId, setEquipmentId] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [durationMin, setDurationMin] = useState<DurationOption>(60);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const existing = useMemo(
    () => reservations.map((r) => ({ start: r.start, end: r.end })),
    [reservations],
  );
  const selection = useMemo(
    () => (startTime ? computeSelection(startTime, durationMin, existing) : null),
    [startTime, durationMin, existing],
  );

  const conflictMessage = selection?.conflict
    ? "선택한 시간이 기존 예약과 겹칩니다. 다른 시간을 선택해주세요."
    : selection?.exceedsClose
      ? "종료 시간이 운영 종료(18:00)를 넘습니다. 시작 시간이나 소요 시간을 조정해주세요."
      : null;

  const canSave =
    !pending &&
    !loading &&
    startTime != null &&
    !selection?.conflict &&
    !selection?.exceedsClose &&
    customer.customerName.trim().length > 0 &&
    equipmentId !== "";

  function submit() {
    if (!startTime) return;
    setBanner(null);
    const values = {
      companyId: customer.companyId,
      customerName: customer.customerName,
      equipmentId,
      visitorName,
      visitorPhone,
      date,
      startTime,
      durationMin,
      memo,
    };
    // 클라 측 동일 스키마 사전 검증(서버 왕복 전 빠른 피드백)
    const parsed = createReservationSchema.safeParse(values);
    if (!parsed.success) {
      setBanner(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
      return;
    }
    startTransition(async () => {
      const result = await createDemoReservation(parsed.data);
      if (result.status === "ok") {
        sessionStorage.setItem("jh-demo-saved", "1");
        router.push(`/admin/demo-reservations?date=${result.date}`);
        return;
      }
      setBanner(result.message);
      if (result.status === "conflict") {
        setStartTime(null);
        onSaved(); // 점유 슬롯 최신화(방금 들어온 예약 반영)
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="고객 *">
          <CustomerCombobox value={customer} onChange={setCustomer} />
        </Field>
        <Field label="데모 장비 *">
          <select
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">장비 선택</option>
            {equipmentOptions.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
                {eq.model ? ` (${eq.model})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="방문자">
          <input
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            placeholder="방문자 이름"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="연락처">
          <input
            value={visitorPhone}
            onChange={(e) => setVisitorPhone(e.target.value)}
            placeholder="010-0000-0000"
            className={`${INPUT_CLS} tabular-nums`}
          />
        </Field>
        <Field label="날짜 *">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                onDateChange(e.target.value);
                setStartTime(null); // 날짜 바뀌면 슬롯 선택 초기화(다른 날 점유 기준)
              }
            }}
            className={`${INPUT_CLS} tabular-nums`}
          />
        </Field>
        {/* 버튼 그룹은 label로 감싸지 않는다(버튼 접근성 이름에 라벨 텍스트가 섞임) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-muted">소요 시간 *</span>
          <div className="flex gap-1.5" role="group" aria-label="소요 시간">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDurationMin(d)}
                aria-pressed={durationMin === d}
                className={`flex-1 rounded-full border px-2 py-2 text-small tabular-nums transition-colors ${
                  durationMin === d
                    ? "border-accent bg-accent font-semibold text-white"
                    : "border-border bg-surface text-text hover:bg-mint-hover"
                }`}
              >
                {d}분
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-small font-medium text-muted">
          시작 시간 * <span className="font-normal text-faint">— 15분 단위, 점유 시간은 선택 불가</span>
        </p>
        {loading ? (
          <p className="py-6 text-center text-small text-faint">예약 현황 불러오는 중…</p>
        ) : (
          <TimeSlotPicker
            existing={existing}
            selectedStart={startTime}
            durationMin={durationMin}
            onSelect={setStartTime}
          />
        )}
      </div>

      <Field label="메모">
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          placeholder="요청 사항·준비물 등"
          className={`${INPUT_CLS} resize-y rounded-md`}
        />
      </Field>

      {(conflictMessage ?? banner) && (
        <div
          role="alert"
          className="rounded-lg border border-coral bg-coral-soft px-4 py-3 text-small font-medium text-coral-text"
        >
          {conflictMessage ?? banner}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-row-line pt-4">
        <p className="text-small text-muted tabular-nums">
          {startTime && selection && !selection.exceedsClose
            ? `${date} · ${startTime}부터 ${durationMin}분`
            : "시작 시간을 선택하세요"}
        </p>
        <Button type="submit" disabled={!canSave}>
          {pending ? "저장 중…" : "예약 저장"}
        </Button>
      </div>
    </form>
  );
}
