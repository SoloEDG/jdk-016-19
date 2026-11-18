import type { Document } from "../../../shared/types";
import { cancelTransition } from "../../sequence/model/transition";
export function selectCrease(doc: Document, id: string) {
  if (doc.paper.creases.some((c) => c.id === id)) {
    doc.selected = id;
    // 只切换当前折痕，不打断正在观察的过渡。
    doc.playing = false;
  }
}
export function toggleDirection(doc: Document) {
  cancelTransition(doc);
  doc.directions[doc.selected] = (doc.directions[doc.selected] ?? 1) * -1;
  doc.angles[doc.selected] = -(doc.angles[doc.selected] ?? 0);
  doc.playing = false;
}
