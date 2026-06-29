// 데모예약 등록 입력 검증 — 서버 액션의 1차 방어선(최후 방어선은 DB EXCLUDE/CHECK 제약).
// 15분 단위·운영시간(09:00–18:00)·소요시간 옵션을 여기서 강제한다.

import { z } from "zod";
import {
  CLOSE_HOUR,
  DURATION_OPTIONS,
  OPEN_HOUR,
  SLOT_MINUTES,
} from "./constants";

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export const createReservationSchema = z
  .object({
    companyId: z.guid().nullable(),
    customerName: z.string().trim().min(1, "고객명을 입력하세요").max(200),
    // 복수 장비(체크박스) — 최소 1개. 같은 장비 시간 겹침은 자식 EXCLUDE가 최종 차단.
    equipmentIds: z.array(z.guid()).min(1, "장비를 1개 이상 선택하세요"),
    // 담당 영업(미지정 허용).
    assigneeId: z.guid().nullable().default(null),
    visitorName: z.string().trim().max(80).optional().default(""),
    visitorPhone: z.string().trim().max(32).optional().default(""),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 잘못되었습니다"),
    startTime: z
      .string()
      .regex(HM, "시각 형식이 잘못되었습니다")
      .refine((t) => toMin(t) % SLOT_MINUTES === 0, "15분 단위만 선택할 수 있습니다"),
    durationMin: z
      .number()
      .refine(
        (d): d is (typeof DURATION_OPTIONS)[number] =>
          (DURATION_OPTIONS as readonly number[]).includes(d),
        "소요 시간이 잘못되었습니다",
      ),
    memo: z.string().trim().max(2000).optional().default(""),
  })
  .refine((v) => toMin(v.startTime) >= OPEN_HOUR * 60, {
    message: "운영 시작(09:00) 이후만 선택할 수 있습니다",
    path: ["startTime"],
  })
  .refine((v) => toMin(v.startTime) + v.durationMin <= CLOSE_HOUR * 60, {
    message: "운영 종료(18:00)를 넘을 수 없습니다",
    path: ["startTime"],
  });

export type CreateReservationValues = z.infer<typeof createReservationSchema>;
