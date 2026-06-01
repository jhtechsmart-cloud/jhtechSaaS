"use client";
import type { UseFormRegister } from "react-hook-form";
import type { RequestFormInputRaw } from "@/lib/applications/schema";

const SEL = "rounded-md border border-border bg-surface px-3 py-2 text-body text-text";

// 설치 장소 설문 — 건물유형·위치·EV·전력·공압·기타(다중)·기타요청.
export function InstallSurvey({ register }: { register: UseFormRegister<RequestFormInputRaw> }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-h2 font-medium text-text">설치 장소 정보</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-small text-muted">
          건물 유형
          <select {...register("building_type")} className={SEL}>
            <option value="factory">공장</option>
            <option value="store">상가</option>
            <option value="office">사무실</option>
            <option value="etc">기타</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">
          설치 위치
          <select {...register("location")} className={SEL}>
            <option value="basement">지하</option>
            <option value="ground">1층</option>
            <option value="upper">2층 이상</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">
          엘리베이터
          <select {...register("elevator")} className={SEL}>
            <option value="have">있음</option>
            <option value="none">없음</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">
          전력
          <select {...register("power")} className={SEL}>
            <option value="single_220">단상 220V</option>
            <option value="triple_380">3상 380V</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">
          공압
          <select {...register("pneumatic")} className={SEL}>
            <option value="have">있음</option>
            <option value="none">없음</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-small text-muted">기타사항(해당 시 체크)</span>
        <div className="flex flex-wrap gap-4 text-body text-text">
          <label className="flex items-center gap-2">
            <input type="checkbox" value="no_vehicle" {...register("handling")} />
            차량 진입 곤란
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" value="manual" {...register("handling")} />
            수작업 운반
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" value="ladder" {...register("handling")} />
            사다리차 필요
          </label>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-small text-muted">
        기타 요청사항
        <textarea {...register("survey_extra")} rows={2} className={SEL} />
      </label>
    </fieldset>
  );
}
