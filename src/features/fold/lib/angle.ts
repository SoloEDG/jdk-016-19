import { clamp } from "../../../shared/document";
export const ANGLE_LIMIT = 175;
export const normalizeAngle = (value: number) =>
  Number.isFinite(value)
    ? clamp(Math.round(value), -ANGLE_LIMIT, ANGLE_LIMIT)
    : 0;
export const angleHint = (angle: number) =>
  Math.abs(angle) < 1
    ? "纸面平展"
    : Math.abs(angle) < 90
      ? "轻折 · 空间打开"
      : Math.abs(angle) < 150
        ? "深折 · 纸面靠拢"
        : "接近平折";
/** 两个角度之间最短的带符号旋转量（结果落在 [-180, 180]）。 */
export function shortestAngleDelta(from: number, to: number) {
  const raw = (to - from) % 360;
  return raw > 180 ? raw - 360 : raw < -180 ? raw + 360 : raw;
}
