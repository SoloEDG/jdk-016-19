import { onUnmounted } from "vue";
import type { Document } from "../../../shared/types";
import {
  requestStep,
  resumeTransition,
  stopTransitionLoop,
} from "./transition";

const EPS = 1e-4;

export function usePlayer(doc: Document) {
  const lastIndex = () => doc.steps.length - 1;

  function play() {
    const tr = doc.transition;
    if (tr && tr.progress < 1 - EPS && !tr.arrived) {
      // 过渡尚未走完：从当前进度继续。
      doc.playing = true;
      resumeTransition(doc);
      return;
    }
    if (tr && tr.plan.blocked) {
      // 受限停留：沿用当前可操作姿态重新试一次，画面会再次停在限位处。
      requestStep(doc, tr.target, { autoPlay: true });
      doc.playing = false;
      return;
    }
    if (tr) {
      // 已到达某个已保存步骤：清理检视滑杆，从这一步继续链式播放。
      doc.transition = null;
    }
    if (doc.step >= lastIndex()) {
      // 从成品反向回放：走完整条教学路径后停在起点。
      requestStep(doc, 0, { autoPlay: true, keepPlaying: false });
      doc.playing = false;
      return;
    }
    doc.playing = true;
    requestStep(doc, Math.min(doc.step + 1, lastIndex()), {
      autoPlay: true,
      keepPlaying: true,
    });
    if (!doc.transition?.playing) doc.playing = false;
  }

  function pause() {
    doc.playing = false;
    if (doc.transition) doc.transition.playing = false;
  }

  function toggle() {
    if (doc.playing || doc.transition?.playing) pause();
    else play();
  }

  onUnmounted(stopTransitionLoop);
  return { toggle, play, pause };
}
