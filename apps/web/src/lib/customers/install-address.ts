// 설치주소 "본사와 동일" 초기 체크 파생 — 설치가 비었거나(미입력) 본사와 같으면 동일로 본다.
// 공백 차이는 무시(trim 후 비교).
export function deriveSameAsHq(hq: string, install: string): boolean {
  const i = install.trim();
  return i === "" || i === hq.trim();
}
