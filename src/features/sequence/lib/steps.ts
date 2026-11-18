import type { Paper, Step } from "../../../shared/types";
export function makeSteps(paper: Paper): Step[] {
  const angles: Record<string, number> = {};
  return [
    {
      id: "flat",
      title: "准备纸张",
      note: "将纸张正面朝上，观察预设折痕。",
      angles: {},
      duration: 1000,
    },
    ...paper.creases.map((c, i) => {
      angles[c.id] = c.target;
      return {
        id: "step-" + i,
        title: c.name,
        note: c.description,
        angles: { ...angles },
        duration: 1600,
      };
    }),
  ];
}
