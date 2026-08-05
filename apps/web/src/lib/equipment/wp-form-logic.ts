// 장비 폼 저장 시 "공개된 홈페이지 글이 내려가는" 경우에만 확인 모달을 띄우는 판정(순수).
// 내려가는 경우 = 공개(publish) 글이 있는 장비에서 ①체크 해제 또는 ②active→inactive '전환' 저장.
// (이미 inactive인 장비의 일반 저장에 매번 모달이 뜨지 않게 전환만 판정 — /review)
export function needsUnpublishConfirm(p: {
  initialEnabled: boolean;
  initialStatus: "active" | "inactive";
  wpPostStatus: "draft" | "publish" | null;
  nextEnabled: boolean;
  nextStatus: "active" | "inactive";
}): boolean {
  if (p.wpPostStatus !== "publish") return false;
  const uncheck = p.initialEnabled && !p.nextEnabled;
  const deactivate = p.initialStatus !== "inactive" && p.nextStatus === "inactive";
  return uncheck || deactivate;
}
