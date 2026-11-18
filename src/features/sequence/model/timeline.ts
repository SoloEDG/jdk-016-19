import type { Document } from "../../../shared/types";
import { clamp } from "../../../shared/document";
import { rebaseTransition, requestStep } from "./transition";

/**
 * 选择步骤不再瞬间替换整组角度，而是从眼前的真实形态出发，
 * 规划一段可以观察、拖动、随时改道的过渡。
 */
export function seek(doc: Document, index: number) {
  return requestStep(doc, index, { autoPlay: true });
}

/**
 * 把眼前可见的形态保存到它归属的步骤上。
 *
 * 过渡途中 doc.step 指向最后一个完整经过的已保存步骤：
 * - 中断后保存记录的是眼前真实角度，而不是原本要去的目标；
 * - 若此刻正好停在目标步骤（过渡已走完），则保存到目标步骤。
 */
export function captureStep(doc: Document) {
  const tr = doc.transition;
  // 受限停留时，眼前形态停在通往目标步骤的路上：
  // 保存到目标步骤，用可达姿态替换掉那条不可达的角度定义。
  const index = tr?.plan.blocked
    ? clamp(tr.target, 0, doc.steps.length - 1)
    : clamp(doc.step, 0, doc.steps.length - 1);
  const step = doc.steps[index];
  if (!step) return null;
  step.angles = { ...doc.angles };
  step.note = "已保存当前折叠形态，可随时还原。";
  // 当前姿态从此归属于刚保存的步骤；进行中的过渡以它为新起点重新规划。
  if (tr) {
    if (tr.plan.blocked) {
      // 目标步骤已经改成可达形态，这一次受限过渡到此结束。
      doc.transition = null;
      doc.playing = false;
      doc.step = index;
    } else {
      rebaseTransition(doc, index);
    }
  }
  return index;
}
