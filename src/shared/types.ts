export type Vec3 = [number, number, number];
export interface Face {
  id: string;
  points: Vec3[];
  parent?: string;
  hinge?: [Vec3, Vec3];
  crease?: string;
}
export interface Crease {
  id: string;
  name: string;
  description: string;
  face: string;
  target: number;
}
export interface Paper {
  id: string;
  name: string;
  subtitle: string;
  size: number;
  faces: Face[];
  creases: Crease[];
}
export interface Step {
  id: string;
  title: string;
  note: string;
  angles: Record<string, number>;
  duration: number;
}
export interface View {
  yaw: number;
  pitch: number;
  zoom: number;
  grid: boolean;
  wire: boolean;
}
/** “path” 沿已保存步骤回放；“direct” 跳过中间步骤，走最短连续角度。 */
export type TransitionMode = "path" | "direct";
export interface TransitionSegment {
  from: Record<string, number>;
  to: Record<string, number>;
  delta: Record<string, number>;
  duration: number;
  start: number;
  /** 这一段原本要抵达的已保存步骤。 */
  step: number;
  /** 是否完整抵达该步骤；被角度限制截断时为 false。 */
  completed: boolean;
}
export interface TransitionBlock {
  /** 无法抵达的步骤。 */
  step: number;
  crease: string;
  name: string;
  /** 进段时的角度。 */
  from: number;
  /** 截断后停下的角度。 */
  at: number;
  /** 该步骤要求的角度。 */
  required: number;
  /** 触碰到的连续角度边界。 */
  limit: number;
  message: string;
}
export interface TransitionPlan {
  from: Record<string, number>;
  /** 可实际抵达的终点（受阻时是限位前的姿态，而非目标步骤）。 */
  to: Record<string, number>;
  keys: string[];
  segments: TransitionSegment[];
  /** 整段过渡时长（毫秒，未乘播放速度）。 */
  total: number;
  via: number[];
  target: number;
  mode: TransitionMode;
  blocked: TransitionBlock | null;
}
export interface TransitionState {
  id: number;
  from: Record<string, number>;
  /** 归属的已保存步骤（最后一个完整经过的步骤，初始为来源步骤）。 */
  source: number;
  /** 起始姿态是否是播放 / 拖动后的临时混合，而非已保存步骤的原貌。 */
  sourceTemporary: boolean;
  /** 是否从正在播放的步骤间姿态接续而来。 */
  sourcePlaying: boolean;
  target: number;
  mode: TransitionMode;
  /** 0–1，可直接由滑杆拖动。 */
  progress: number;
  playing: boolean;
  arrived: boolean;
  plan: TransitionPlan;
}
export interface Document {
  paper: Paper;
  front: string;
  back: string;
  texture: string;
  selected: string;
  angles: Record<string, number>;
  directions: Record<string, number>;
  steps: Step[];
  step: number;
  playing: boolean;
  speed: number;
  transitionMode: TransitionMode;
  transition: TransitionState | null;
  view: View;
}
export interface PoseFace {
  id: string;
  points: Vec3[];
  normal: Vec3;
}
