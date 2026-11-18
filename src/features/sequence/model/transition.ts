import type {
  Document,
  TransitionMode,
  TransitionPlan,
  TransitionState,
} from "../../../shared/types";
import { clamp } from "../../../shared/document";
import { anglesMatch, anchorStep, buildPlan, normalizeAngles, samplePlan } from "../lib/planner";

const EPS = 1e-6;

export interface StartOptions {
  mode?: TransitionMode;
  /** 创建后立刻自动播放，默认 true。 */
  autoPlay?: boolean;
  /** 保留 doc.playing，用于播放在步骤之间链式接续。 */
  keepPlaying?: boolean;
}

interface Runtime {
  doc: Document | null;
  frame: number;
  last: number;
  /** 当前是否正处在 tick 内，避免链式过渡重复排队帧。 */
  inTick: boolean;
}

const runtime: Runtime = { doc: null, frame: 0, last: 0, inTick: false };
let sequence = 0;

function stepAngles(doc: Document, index: number) {
  return normalizeAngles(doc.steps[index]?.angles ?? {});
}

function targetCrease(doc: Document, index: number) {
  return doc.paper.creases[index - 1];
}

function schedule(doc: Document) {
  runtime.doc = doc;
  // tick 内部启动的链式过渡由 tick 末尾统一续帧，避免重复循环。
  if (runtime.inTick) return;
  if (!runtime.frame) {
    runtime.last = 0;
    runtime.frame = requestAnimationFrame(tick);
  }
}

/** 卸载时或纸张重置时停止全局帧循环。 */
export function stopTransitionLoop() {
  if (runtime.frame) cancelAnimationFrame(runtime.frame);
  runtime.frame = 0;
  runtime.last = 0;
  runtime.doc = null;
  runtime.inTick = false;
}

/**
 * 只写折痕角度；纸面姿态始终由 solvePose 重新求解。
 * 因此纸张保持原尺寸，并围绕跟随父级运动的折轴转动，
 * 不会出现把当前投影点直接连线插值的伪过渡。
 */
function applyProgress(doc: Document, tr: TransitionState, progress: number) {
  const p = clamp(progress, 0, 1);
  tr.progress = p;
  const atEnd = p >= 1 - EPS;
  if (atEnd && !tr.plan.blocked) {
    doc.angles = { ...tr.plan.to };
    doc.step = tr.target;
    tr.arrived = true;
    return;
  }
  doc.angles = samplePlan(tr.plan, p);
  doc.step = anchorStep(tr.plan, p, tr.source);
  tr.arrived = false;
}

function chainPlayback(doc: Document) {
  let goal = doc.step + 1;
  while (goal < doc.steps.length) {
    const plan = buildPlan(doc, doc.angles, goal, "path");
    if (!plan.segments.length) {
      if (plan.blocked) {
        doc.playing = false;
        beginFrom(doc, { ...doc.angles }, goal, "path", { autoPlay: false });
        return;
      }
      doc.step = goal;
      doc.angles = { ...plan.to };
      goal += 1;
      continue;
    }
    beginFrom(doc, { ...doc.angles }, goal, "path", {
      autoPlay: true,
      keepPlaying: true,
    });
    return;
  }
  doc.playing = false;
}

function finishTransition(doc: Document, tr: TransitionState) {
  tr.progress = 1;
  tr.playing = false;
  if (tr.plan.blocked) {
    doc.angles = { ...tr.plan.to };
    doc.step = anchorStep(tr.plan, 1, tr.source);
    tr.arrived = false;
    doc.playing = false;
    const crease = doc.paper.creases.find(
      (c) => c.id === tr.plan.blocked!.crease,
    );
    if (crease) doc.selected = crease.id;
    return;
  }
  doc.angles = { ...tr.plan.to };
  doc.step = tr.target;
  tr.arrived = true;
  const crease = targetCrease(doc, tr.target);
  if (crease) doc.selected = crease.id;
  if (doc.playing) chainPlayback(doc);
}

function tick(now: number) {
  runtime.frame = 0;
  runtime.inTick = true;
  const doc = runtime.doc;
  const tr = doc?.transition ?? null;
  if (!doc || !tr || !tr.playing) {
    runtime.last = 0;
    runtime.doc = null;
    runtime.inTick = false;
    return;
  }
  if (!runtime.last) runtime.last = now;
  const delta = clamp(now - runtime.last, 0, 64);
  runtime.last = now;
  const speed = Number.isFinite(doc.speed) && doc.speed > 0 ? doc.speed : 1;
  const total = Math.max(1, tr.plan.total);
  applyProgress(doc, tr, Math.min(1, tr.progress + (delta * speed) / total));
  if (tr.progress >= 1 - EPS && tr.playing) finishTransition(doc, tr);
  runtime.inTick = false;
  // 每帧都重新读取 doc.transition：若期间用户改选了目标，
  // 旧过渡已经被替换，绝不会在结束时覆盖新目标。
  const current = doc.transition;
  if (current && current.playing) {
    runtime.frame = requestAnimationFrame(tick);
  } else {
    runtime.last = 0;
    runtime.doc = null;
  }
}

function beginFrom(
  doc: Document,
  fromAngles: Record<string, number>,
  rawTarget: number,
  mode: TransitionMode,
  options: StartOptions,
) {
  const wasPlaying = !!doc.playing || !!doc.transition?.playing;
  const source = clamp(doc.step, 0, Math.max(0, doc.steps.length - 1));
  const sourceIsSaved = anglesMatch(
    fromAngles,
    doc.steps[source]?.angles ?? {},
  );
  const plan: TransitionPlan = buildPlan(
    doc,
    fromAngles,
    rawTarget,
    mode,
    // 过渡途中改道时，纸面已经在两个步骤之间；
    // 反向目标无需先绕回来源步骤，否则画面会先向前弹一下。
    !!doc.transition,
  );
  const settled = anglesMatch(fromAngles, stepAngles(doc, plan.target));
  const active = doc.transition;

  if (!plan.segments.length && !plan.blocked) {
    // 已经在目标步骤上：保留已有的检视滑杆，只把归属对齐到已保存角度。
    if (active && active.target === plan.target && active.plan.segments.length) {
      if (!options.keepPlaying) doc.playing = false;
      return active;
    }
    doc.transition = null;
    doc.angles = { ...plan.to };
    doc.step = plan.target;
    doc.playing = options.keepPlaying ? wasPlaying : false;
    if (options.keepPlaying && doc.playing) chainPlayback(doc);
    return null;
  }

  const tr: TransitionState = {
    id: ++sequence,
    from: { ...fromAngles },
    source,
    sourceTemporary: !sourceIsSaved && !settled,
    sourcePlaying: wasPlaying && !settled,
    target: plan.target,
    mode,
    progress: 0,
    playing: false,
    arrived: false,
    plan,
  };
  doc.transition = tr;
  doc.angles = samplePlan(plan, 0);
  doc.step = source;
  if (!options.keepPlaying) doc.playing = false;
  if (options.autoPlay !== false && plan.segments.length) {
    const created = doc.transition;
    if (created) {
      created.playing = true;
      schedule(doc);
    }
  }
  return doc.transition;
}

/**
 * 以眼前形态为起点开始过渡；过渡途中再次调用即改选目标。
 * 旧过渡不会在结束后覆盖新目标——它已被整个替换。
 */
export function requestStep(
  doc: Document,
  index: number,
  options: StartOptions = {},
) {
  const mode = options.mode ?? doc.transitionMode;
  return beginFrom(doc, { ...doc.angles }, index, mode, {
    autoPlay: options.autoPlay ?? true,
    keepPlaying: options.keepPlaying ?? false,
  });
}

/** 拖动过渡进度条：暂停自动运动，但保留过渡，可继续前后观察。 */
export function scrubTransition(doc: Document, progress: number) {
  const tr = doc.transition;
  if (!tr) return;
  doc.playing = false;
  tr.playing = false;
  applyProgress(doc, tr, progress);
}

/** 单独播放 / 暂停当前过渡（不串联后续步骤）。 */
export function toggleTransitionPlay(doc: Document) {
  const tr = doc.transition;
  if (!tr) return;
  doc.playing = false;
  if (tr.progress >= 1 - EPS) {
    tr.progress = 0;
    applyProgress(doc, tr, 0);
    tr.playing = true;
  } else {
    tr.playing = !tr.playing;
  }
  if (tr.playing) schedule(doc);
}

/** 继续播放已被暂停的过渡（播放器按钮使用）。 */
export function resumeTransition(doc: Document) {
  const tr = doc.transition;
  if (!tr || tr.arrived || tr.progress >= 1 - EPS) return;
  tr.playing = true;
  schedule(doc);
}

/**
 * 在当前姿态被保存为新步骤锚点后，让进行中的过渡从这一刻重新规划，
 * 保持“起点归属 / 剩余目标”一致，避免旧时间线在保存后错位。
 */
export function rebaseTransition(doc: Document, source: number) {
  const tr = doc.transition;
  if (!tr) return null;
  const wasPlaying = tr.playing;
  const mode = tr.mode;
  const target = tr.target;
  tr.source = source;
  tr.sourceTemporary = false;
  tr.sourcePlaying = false;
  tr.from = { ...doc.angles };
  return beginFrom(doc, { ...doc.angles }, target, mode, {
    autoPlay: wasPlaying,
    keepPlaying: doc.playing,
  });
}

/**
 * 切换路径策略；若正在过渡，从当前可见形态按新策略重新规划到同一目标。
 * 起点仍然是眼前的临时姿态，归属步骤保持不变。
 */
export function setTransitionMode(doc: Document, mode: TransitionMode) {
  doc.transitionMode = mode;
  const tr = doc.transition;
  if (!tr) return;
  // 已经停在目标步骤上：姿态无需变化，只更新策略标签即可。
  if (tr.progress >= 1 - EPS && !tr.plan.blocked) {
    tr.mode = mode;
    return;
  }
  beginFrom(doc, { ...doc.angles }, tr.target, mode, {
    autoPlay: tr.playing,
    keepPlaying: doc.playing,
  });
}

/**
 * 中断过渡但保留眼前姿态。
 * doc.step 仍是最后一个完整经过的已保存步骤，doc.angles 是真实可见形态，
 * 之后保存会记录这个形态，而不是回到旧目标。
 */
export function cancelTransition(doc: Document) {
  doc.transition = null;
  doc.playing = false;
}
