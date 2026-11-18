<script setup lang="ts">
import { computed } from "vue";
import type { Document, TransitionMode } from "../../../shared/types";
import {
  cancelTransition,
  scrubTransition,
  setTransitionMode,
  toggleTransitionPlay,
} from "../model/transition";
const props = defineProps<{ doc: Document }>();
defineEmits<{ seek: [n: number]; play: []; capture: [] }>();

const transition = computed(() => props.doc.transition);
const blocked = computed(() => props.doc.transition?.plan.blocked ?? null);
const hasSavedTarget = computed(() => {
  const tr = props.doc.transition;
  return !!tr && !tr.plan.blocked && tr.progress >= 1 - 1e-4;
});
const percent = computed(() =>
  Math.round((props.doc.transition?.progress ?? 0) * 100),
);
const sourcePose = computed(() => {
  const tr = props.doc.transition;
  if (!tr) return "";
  if (tr.sourceTemporary) {
    return tr.sourcePlaying
      ? `从播放途中的临时姿态出发，归属步骤 ${tr.source + 1}`
      : `从临时姿态出发，归属步骤 ${tr.source + 1}`;
  }
  return `从步骤 ${tr.source + 1} 的已保存形态出发`;
});
const ownerLabel = computed(() => {
  const tr = props.doc.transition;
  if (!tr) return "";
  if (tr.plan.blocked) {
    return `受限停留 · 尚未到达步骤 ${tr.target + 1} · 形态可继续操作`;
  }
  if (tr.progress >= 1 - 1e-4) {
    return `已保存步骤 ${tr.target + 1} · ${props.doc.steps[tr.target]?.title ?? ""}`;
  }
  if (tr.progress <= 1e-4) {
    return tr.sourceTemporary
      ? `${tr.sourcePlaying ? "播放途中" : "手动调整出的"}临时姿态 · 归属步骤 ${tr.source + 1}`
      : `已保存步骤 ${tr.source + 1} · ${props.doc.steps[tr.source]?.title ?? ""}`;
  }
  return `过渡中的临时形态 · 归属步骤 ${props.doc.step + 1}`;
});
const saveLabel = computed(() => {
  const tr = props.doc.transition;
  if (!tr) return "保存当前步骤";
  if (tr.plan.blocked) return `保存到步骤 ${tr.target + 1}`;
  if (tr.progress > 1e-4 && tr.progress < 1 - 1e-4) {
    return `保存形态到步骤 ${props.doc.step + 1}`;
  }
  return "保存当前步骤";
});
const badge = computed(() => {
  const tr = props.doc.transition;
  if (!tr) return "";
  if (tr.sourceTemporary) {
    return tr.sourcePlaying ? "播放临时姿态" : "临时姿态";
  }
  return "起点 · 步骤 " + String(tr.source + 1).padStart(2, "0");
});
const badgeTemp = computed(() => !!props.doc.transition?.sourceTemporary);
const viaLabel = computed(() => {
  const tr = props.doc.transition;
  if (!tr) return "";
  if (tr.mode === "direct") return "最短连续姿态";
  const hops = tr.plan.via.filter((i) => i !== tr.target).length;
  return hops ? `沿教学路径 · 途经 ${hops} 步` : "教学路径";
});
function switchMode(mode: TransitionMode) {
  setTransitionMode(props.doc, mode);
}
function onScrub(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  scrubTransition(props.doc, value / 1000);
}
function togglePlay() {
  const tr = props.doc.transition;
  if (!tr) return;
  toggleTransitionPlay(props.doc);
}
</script>
<template>
  <section class="timeline">
    <div class="timeline-top">
      <div>
        <span class="eyebrow">折叠步骤</span><b>点选步骤，观看纸面如何过渡。</b>
      </div>
      <div class="playback">
        <div class="mode-toggle" role="group" aria-label="过渡方式">
          <button
            :class="{ active: doc.transitionMode === 'path' }"
            title="沿已保存的教学步骤逐步回放"
            @click="switchMode('path')"
          >
            教学路径</button
          ><button
            :class="{ active: doc.transitionMode === 'direct' }"
            title="跳过中间步骤，寻找更短的连续角度路径"
            @click="switchMode('direct')"
          >
            最短路径
          </button>
        </div>
        <select v-model.number="doc.speed" aria-label="播放速度">
          <option :value="0.5">0.5×</option>
          <option :value="1">1×</option>
          <option :value="2">2×</option></select
        ><button
          title="上一步"
          aria-label="上一步"
          @click="$emit('seek', doc.step - 1)"
        >
          ‹</button
        ><button class="play" aria-label="播放步骤" @click="$emit('play')">
          {{ doc.playing || doc.transition?.playing ? "Ⅱ" : "▶" }}</button
        ><button
          title="下一步"
          aria-label="下一步"
          @click="$emit('seek', doc.step + 1)"
        >
          ›</button
        ><button class="save-step" @click="$emit('capture')">
          {{ saveLabel }}
        </button>
      </div>
    </div>

    <div
      v-if="transition"
      class="transition-bar"
      :class="{ blocked: !!blocked, settled: hasSavedTarget }"
    >
      <div class="transition-head">
        <span
          class="transition-badge"
          :class="{ temp: badgeTemp }"
          :title="sourcePose"
        >
          {{ badge }}
        </span>
        <span class="transition-arrow">→</span>
        <span class="transition-target">
          目标 · {{ String(transition.target + 1).padStart(2, "0") }}
          {{ doc.steps[transition.target]?.title }}
        </span>
        <span class="transition-via">{{ viaLabel }}</span>
        <span v-if="blocked" class="transition-flag">受限</span>
        <span v-else-if="hasSavedTarget" class="transition-flag ok"
          >已到达</span
        >
      </div>
      <div class="transition-scrub">
        <input
          aria-label="过渡进度"
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="Math.round(transition.progress * 1000)"
          @input="onScrub"
        />
        <b>{{ percent }}%</b>
      </div>
      <div class="transition-actions">
        <span class="transition-note" :title="sourcePose">现状：{{ ownerLabel }}</span>
        <button
          v-if="!hasSavedTarget && !blocked"
          class="transition-play"
          :aria-label="transition.playing ? '暂停过渡' : '播放过渡'"
          @click="togglePlay"
        >
          {{ transition.playing ? "暂停过渡" : "播放过渡" }}
        </button>
        <button class="transition-cancel" @click="cancelTransition(doc)">
          中断并保留当前形态
        </button>
      </div>
      <p v-if="blocked" class="transition-warning" role="status">
        {{ blocked.message }}
      </p>
    </div>

    <div class="step-track">
      <button
        v-for="(s, i) in doc.steps"
        :key="s.id"
        :class="{
          current: doc.step === i,
          done: doc.step > i,
          target: transition && transition.target === i,
        }"
        @click="$emit('seek', i)"
      >
        <span class="step-dot">{{
          doc.step > i ? "✓" : String(i + 1).padStart(2, "0")
        }}</span
        ><span
          ><b>{{ s.title }}</b
          ><small>{{
            i === 0
              ? "START"
              : i === doc.steps.length - 1
                ? "FINISH"
                : "FOLD " + String(i).padStart(2, "0")
          }}</small></span
        ><i v-if="i < doc.steps.length - 1"></i>
      </button>
    </div>
  </section>
</template>
