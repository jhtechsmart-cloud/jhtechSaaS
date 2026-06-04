import { randomInt } from "node:crypto";

// 혼동 문자(0/O/1/l/I) 제외 — 1회 노출 모달에서 사람이 옮겨적기 쉽게.
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const ALL = LOWER + UPPER + DIGIT;

// 임시 비밀번호 — 14자, 소문자·대문자·숫자 각 1개 이상 보장 후 채우고 셔플.
// node:crypto randomInt(CSPRNG) 사용. 서버에서만 생성하고 저장하지 않는다(1회 노출).
export function generateTempPassword(): string {
  const len = 14;
  const chars: string[] = [
    LOWER[randomInt(LOWER.length)],
    UPPER[randomInt(UPPER.length)],
    DIGIT[randomInt(DIGIT.length)],
  ];
  while (chars.length < len) chars.push(ALL[randomInt(ALL.length)]);
  // Fisher–Yates 셔플 — 보장 문자 위치를 분산.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
