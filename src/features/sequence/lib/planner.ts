import type {
  Document,
  TransitionBlock,
  TransitionMode,
  TransitionPlan,
  TransitionSegment,
} from "../../../shared/types";
import { clamp } from "../../../shared/document";
import { ANGLE_LIMIT, shortestAngleDelta } from "../../fold/lib/angle";

export type AngleMap = Record<string, number>;

const EPS = 1e-6;

/** 两套角度是否描述同一个三维姿态（允许相差整圈）。 */
export function anglesMatch(a: AngleMap, b: AngleMap) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (Math.abs(shortestAngleDelta(a[key] ?? 0, b[key] ?? 0)) > 1e-4) {
      return false;
    }
  }
  return true;
}

export function normalizeAngles(angles: AngleMap): AngleMap {
  return Object.fromEntries(
    Object.entries(angles).map(([key, value]) => [
      key,
      Number.isFinite(value) ? clamp(value, -ANGLE_LIMIT, ANGLE_LIMIT) : 0,
    ]),
  );
}

function compactAngles(angles: AngleMap): AngleMap {
  return Object.fromEntries(
    Object.entries(angles).filter(([, value]) => Number.isFinite(value)),
  );
}

function stepAngles(step: { angles: AngleMap } | undefined): AngleMap {
  return normalizeAngles(step?.angles ?? {});
}

/** 转动过程中 0..1 之间的越界位置；不会越界则返回 1。 */
function crossingFraction(start: number, delta: number) {
  if (delta > EPS) {
    const room = ANGLE_LIMIT - start;
    if (room <= EPS) return 0;
    return delta > room ? clamp(room / delta, 0, 1) : 1;
  }
  if (delta < -EPS) {
    const room = start + ANGLE_LIMIT;
    if (room <= EPS) return 0;
    return -delta > room ? clamp(room / -delta, 0, 1) : 1;
  }
  return 1;
}

function blockMessage(
  name: string,
  from: number,
  required: number,
  at: number,
  limit: number,
) {
  return (
    `「${name}」从 ${Math.round(from)}° 转到该步骤需要 ${Math.round(
      required,
    )}°，途中会越过 ${limit > 0 ? "+" : "−"}${ANGLE_LIMIT}° 的连续角度限制。` +
    `已停在 ${Math.round(at)}° 的可继续操作形态，没有直接跳到目标。` +
    `可先手动把「${name}」转向相反方向，让目标落入连续范围，或改选其他步骤。`
  );
}

/**
 * 只规划折痕角度的时间线。纸面每帧都由 solvePose 重新求解，
 * 因此纸张保持原尺寸，并围绕各自随父级运动的折轴转动。
 * 全程使用最短有符号增量，反向跨越多个步骤也不会突然翻转。
 */
export function buildPlan(
  doc: Document,
  fromAngles: AngleMap,
  rawTarget: number,
  mode: TransitionMode,
  /** 反向改道时跳过“先回到来源步骤”，避免纸面先向前弹一下。 */
  skipSourceAnchor = false,
): TransitionPlan {
  const steps = doc.steps;
  const target = clamp(
    Math.round(rawTarget),
    0,
    Math.max(0, steps.length - 1),
  );
  const source = clamp(doc.step, 0, Math.max(0, steps.length - 1));
  const from = compactAngles(normalizeAngles(fromAngles));
  const keys = [
    ...new Set([
      ...Object.keys(from),
      ...steps.flatMap((step) => Object.keys(step.angles)),
    ]),
  ];
  const sourceIsSaved = anglesMatch(from, stepAngles(steps[source]));

  const via: number[] = [];
  if (mode === "direct") {
    via.push(target);
  } else if (target > source) {
    for (let i = source + 1; i <= target; i++) via.push(i);
  } else if (target < source) {
    // 反向时先回到来源步骤（若当前是临时形态），再逐级退回目标，
    // 全程使用最短连续增量，不会突然翻转。
    if (!sourceIsSaved && !skipSourceAnchor) via.push(source);
    for (let i = source - 1; i >= target; i--) via.push(i);
  } else if (!sourceIsSaved) {
    via.push(source);
  }

  const segments: TransitionSegment[] = [];
  let cursor: AngleMap = { ...from };
  let elapsed = 0;
  let blocked: TransitionBlock | null = null;

  for (const index of via) {
    const destination = stepAngles(steps[index]);
    const delta: AngleMap = {};
    for (const key of keys) {
      // 始终取最短有符号增量：反向跨步骤不会突然翻转；
      // 若这段连续旋转会越过 ±175° 限位，就在限位处停下并说明阻碍。
      delta[key] = shortestAngleDelta(
        cursor[key] ?? 0,
        destination[key] ?? 0,
      );
    }

    let fraction = 1;
    let breach: string | null = null;
    for (const key of keys) {
      const f = crossingFraction(cursor[key] ?? 0, delta[key] ?? 0);
      if (f < fraction - EPS) {
        fraction = f;
        breach = key;
      }
    }

    // 在越界发生的那一刻停下，保留可继续操作的角度。
    const scale = breach === null ? 1 : Math.max(0, fraction - 1e-4);
    const segmentDelta: AngleMap = {};
    let travel = 0;
    for (const key of keys) {
      segmentDelta[key] = (delta[key] ?? 0) * scale;
      travel = Math.max(travel, Math.abs(segmentDelta[key] ?? 0));
    }
    if (breach !== null) {
      const start = cursor[breach] ?? 0;
      const required = start + (delta[breach] ?? 0);
      const at = start + (segmentDelta[breach] ?? 0);
      const limit = (delta[breach] ?? 0) > 0 ? ANGLE_LIMIT : -ANGLE_LIMIT;
      const crease = doc.paper.creases.find((c) => c.id === breach);
      blocked = {
        step: index,
        crease: breach,
        name: crease?.name ?? breach,
        from: start,
        at,
        required,
        limit,
        message: blockMessage(
          crease?.name ?? breach,
          start,
          required,
          at,
          limit,
        ),
      };
    }

    const duration = travel > EPS ? clamp(travel * 12, 260, 2000) : 0;
    const next: AngleMap = {};
    for (const key of keys) {
      next[key] = (cursor[key] ?? 0) + (segmentDelta[key] ?? 0);
    }
    if (travel > EPS || !segments.length) {
      segments.push({
        from: { ...cursor },
        to: next,
        delta: segmentDelta,
        duration,
        start: elapsed,
        step: index,
        completed: breach === null,
      });
    } else if (segments.length) {
      // 角度相同的相邻步骤：并入上一段，保持步骤归属连续。
      segments[segments.length - 1]!.step = index;
      segments[segments.length - 1]!.completed =
        segments[segments.length - 1]!.completed && breach === null;
    }
    elapsed += duration;
    cursor = next;

    if (blocked) break;
  }

  return {
    from,
    to: { ...cursor },
    keys,
    segments,
    total: elapsed,
    via,
    target,
    mode,
    blocked,
  };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** 在规划好的时间线上采样任意进度，得到连续角度。 */
export function samplePlan(plan: TransitionPlan, progress: number): AngleMap {
  const p = clamp(progress, 0, 1);
  if (!plan.segments.length) return { ...plan.from };
  if (plan.total <= EPS) return { ...plan.to };
  const time = p * plan.total;
  let segment = plan.segments[0]!;
  for (const candidate of plan.segments) {
    if (time >= candidate.start - EPS) segment = candidate;
    else break;
  }
  const t =
    segment.duration > EPS
      ? clamp((time - segment.start) / segment.duration, 0, 1)
      : 1;
  const mixed = ease(t);
  const result: AngleMap = {};
  for (const key of plan.keys) {
    result[key] = (segment.from[key] ?? 0) + (segment.delta[key] ?? 0) * mixed;
  }
  return result;
}

/**
 * 当前进度下，姿态可以归属的最后一个完整经过的已保存步骤。
 * 没有走完的步骤不会被算作已到达，因此中断后保存记录的仍是眼前真实形态。
 */
export function anchorStep(
  plan: TransitionPlan,
  progress: number,
  source: number,
): number {
  if (progress >= 1 - 1e-4) {
    if (!plan.blocked) return plan.target;
  }
  const time = progress * plan.total;
  for (let i = plan.segments.length - 1; i >= 0; i--) {
    const segment = plan.segments[i]!;
    if (segment.completed && time >= segment.start + segment.duration - EPS) {
      return segment.step;
    }
  }
  return source;
}
