// 폼 에러 요약 — react-hook-form errors(중첩 가능)를 사람용 메시지 배열로 평탄화.
// zod 메시지가 이미 사용자 친화적이라 그대로 모아 상단 배너로 보여준다(긴 폼에서 무반응 제출 방지).
export function collectErrorMessages(errors: unknown): string[] {
  const messages: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const msg = obj.message;
    if (typeof msg === "string" && msg.length > 0) {
      messages.push(msg);
      return; // 이 노드는 잎(에러 객체) — 더 내려가지 않음
    }
    for (const value of Object.values(obj)) walk(value);
  };
  walk(errors);
  return Array.from(new Set(messages)); // 중복 제거
}
