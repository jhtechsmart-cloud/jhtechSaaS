// 장비 폼 저장 시 "공개된 홈페이지 글이 내려가는" 경우에만 확인 모달을 띄우는 판정(순수).
// 내려가는 경우 = 공개(publish) 글이 있는 장비에서 ①체크 해제 또는 ②inactive 전환 저장.
export function needsUnpublishConfirm(p: {
  initialEnabled: boolean;
  wpPostStatus: "draft" | "publish" | null;
  nextEnabled: boolean;
  nextStatus: "active" | "inactive";
}): boolean {
  if (p.wpPostStatus !== "publish") return false;
  const uncheck = p.initialEnabled && !p.nextEnabled;
  const deactivate = p.nextStatus === "inactive";
  return uncheck || deactivate;
}
