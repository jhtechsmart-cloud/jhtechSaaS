// 일정 타임라인 겹침 배치 — 같은 시간대 예약(복수장비 개편으로 가능)을 열로 나눠 나란히.
// 사이드이펙트 없는 순수 함수. 캘린더 이벤트 레이아웃(구글 캘린더 단순화)과 같은 방식:
// ① 겹치는 예약을 한 클러스터로 묶고 ② 클러스터 내 그리디 레인 배정 ③ 레인 수 = 열 수.

export interface TimelineItem {
  id: string;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

export interface TimelinePlacement {
  col: number; // 0-based 열 인덱스
  cols: number; // 그 예약이 속한 클러스터의 총 열 수
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 예약별 {col, cols} 배치를 계산한다. 반개구간(end==start는 겹침 아님) 기준.
 * 겹치지 않는 예약은 cols=1(전체 폭). 겹치면 클러스터 총 열 수로 나눠 col 위치를 받는다.
 */
export function layoutDayReservations(
  items: TimelineItem[],
): Map<string, TimelinePlacement> {
  const result = new Map<string, TimelinePlacement>();
  const sorted = [...items].sort((a, b) => {
    const sa = toMin(a.start);
    const sb = toMin(b.start);
    if (sa !== sb) return sa - sb;
    const ea = toMin(a.end);
    const eb = toMin(b.end);
    if (ea !== eb) return ea - eb;
    return a.id.localeCompare(b.id);
  });

  let clusterEnd = -Infinity;
  let lanes: number[] = []; // 레인 인덱스 → 그 레인의 마지막 종료(분)
  let members: { id: string; lane: number }[] = [];

  const flush = () => {
    const cols = lanes.length;
    for (const m of members) result.set(m.id, { col: m.lane, cols });
    lanes = [];
    members = [];
  };

  for (const it of sorted) {
    const s = toMin(it.start);
    const e = toMin(it.end);
    // 현재 클러스터와 안 겹치면(시작 >= 클러스터 최대 종료) 클러스터 마감.
    if (members.length > 0 && s >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    // 비어 있는 레인(종료 <= 이 시작) 재사용, 없으면 새 레인.
    let lane = lanes.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(e);
    } else {
      lanes[lane] = e;
    }
    members.push({ id: it.id, lane });
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return result;
}
