import { TreatmentPlan, TreatmentStage } from '@prisma/client';

export type PlanWithStages = TreatmentPlan & { stages: TreatmentStage[] };

/** 当前治疗阶段：取状态为 ACTIVE 且副数范围覆盖当前副数的第一个阶段 */
export function currentStage(plan: PlanWithStages): TreatmentStage | null {
  const actives = plan.stages.filter((s) => s.status === 'ACTIVE').sort((a, b) => a.seq - b.seq);
  if (!actives.length) return null;
  const cur = plan.currentAligner || 0;
  return actives.find((s) => s.alignerTo == null || cur <= s.alignerTo) || actives[0];
}

/** 疗程延误评估：异常累计影响天数 + 预计结束是否已过 */
export function delayInfo(plan: TreatmentPlan, exceptions: { impactDays: number }[]) {
  const impact = exceptions.reduce((s, e) => s + (e.impactDays || 0), 0);
  const now = new Date();
  const overdueDays =
    plan.expectedEnd && now > plan.expectedEnd
      ? Math.floor((now.getTime() - plan.expectedEnd.getTime()) / 86400000)
      : 0;
  return { impactDays: impact, overdueDays, delayed: impact > 0 || overdueDays > 0 };
}

export const PLAN_TYPE_LABEL: Record<string, string> = {
  INVISIBLE: '隐形矫治',
  FIXED: '固定托槽',
  PEDIATRIC: '儿童早矫',
};

/** 各方案类型的默认复诊节奏（周）与材料规则说明 */
export const PLAN_TYPE_RULES: Record<string, { revisitWeeks: number; alignerDays?: number; material: string }> = {
  INVISIBLE: { revisitWeeks: 10, alignerDays: 10, material: '隐形矫治器（按批次由技工所制作）' },
  FIXED: { revisitWeeks: 5, material: '托槽/弓丝/结扎圈（椅旁耗材）' },
  PEDIATRIC: { revisitWeeks: 6, material: '肌功能矫治器/扩弓器' },
};
