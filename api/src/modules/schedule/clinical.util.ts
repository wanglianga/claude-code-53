import { TreatmentPlan } from '@prisma/client';

export interface PendingItem {
  kind: 'extraction' | 'attachment' | 'ipr' | 'retainer';
  label: string;
}

export interface ClinicalContext {
  /** 建议预约类型（复诊/粘附件/拔牙/片切/保持器交付） */
  type: string;
  /** 建议占用时长（分钟） */
  durationMin: number;
  /** 建议复诊节点（日期） */
  targetDate: Date;
  /** 人类可读的推导依据 */
  reason: string;
  /** 待执行临床项（驱动类型的计划字段） */
  pendingItems: PendingItem[];
}

/** 各预约类型的默认椅位占用时长（分钟） */
export const TYPE_DURATION: Record<string, number> = {
  复诊: 30,
  粘附件: 60,
  拔牙: 60,
  片切: 45,
  重启取模: 60,
  保持器交付: 30,
  急诊: 30,
};

function tomorrow(now: Date): Date {
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  t.setHours(0, 0, 0, 0);
  return t;
}

/**
 * 临床规则引擎：把治疗计划字段（当前矫治器副数、附件粘接、拔牙、片切计划）
 * 折算为复诊节点、预约类型与占用时长。
 *
 * 规则：
 * 1. 计划内存在未执行临床项时优先安排处置类预约（拔牙 > 粘附件 > 片切 > 保持器交付），节点为最近可约日；
 * 2. 否则按方案节奏推算常规复诊节点：
 *    - 隐形矫治：min(复诊节奏天数, 手中剩余矫治器可戴天数)，手中批次取技工单已发货/已签收的最大副数；
 *    - 固定托槽 / 儿童早矫：上次复诊（或方案开始）+ 复诊节奏天数；
 * 3. 节点已过期（患者逾期未复诊）→ 提到最近可约日。
 */
export function computeClinicalContext(opts: {
  plan: TreatmentPlan;
  lastVisitAt: Date | null;
  labMaxAligner: number | null;
  now?: Date;
}): ClinicalContext {
  const { plan, lastVisitAt, labMaxAligner } = opts;
  const now = opts.now || new Date();
  const soon = tomorrow(now);

  const attachments = (plan.attachments as any[]) || [];
  const extractions = (plan.extractions as any[]) || [];
  const iprList = (plan.ipr as any[]) || [];

  // ---- 1) 待执行临床项（计划字段直接决定预约类型与时长） ----
  const procedures: { kind: PendingItem['kind']; label: string; type: string }[] = [];
  const unextracted = extractions.filter((e) => !e.done);
  if (unextracted.length) {
    procedures.push({
      kind: 'extraction',
      label: `拔牙计划未执行：${unextracted.map((e) => e.tooth).join('、')}`,
      type: '拔牙',
    });
  }
  const unbonded = attachments.filter((a) => !a.bonded);
  if (unbonded.length) {
    procedures.push({
      kind: 'attachment',
      label: `附件未粘接：${unbonded.map((a) => a.tooth).join('、')}`,
      type: '粘附件',
    });
  }
  const pendingIpr = iprList.filter((i) => !i.done);
  if (pendingIpr.length) {
    procedures.push({
      kind: 'ipr',
      label: `片切未执行：${pendingIpr.map((i) => `${i.tooth} ${i.mm}mm`).join('、')}`,
      type: '片切',
    });
  }
  if (plan.type === 'INVISIBLE' && plan.totalAligners && (plan.currentAligner || 0) >= plan.totalAligners) {
    procedures.push({
      kind: 'retainer',
      label: `矫治器已全部佩戴完成（${plan.totalAligners}/${plan.totalAligners} 副），进入保持器交付`,
      type: '保持器交付',
    });
  }

  const pendingItems: PendingItem[] = procedures.map((p) => ({ kind: p.kind, label: p.label }));
  if (procedures.length) {
    const p = procedures[0];
    return {
      type: p.type,
      durationMin: TYPE_DURATION[p.type] || 30,
      targetDate: soon,
      reason: `存在待执行临床项：${p.label}，建议尽快安排`,
      pendingItems,
    };
  }

  // ---- 2) 常规复诊节点 ----
  const base = lastVisitAt || plan.startDate || now;
  const cycleDays = (plan.revisitWeeks || 6) * 7;
  let daysAhead = cycleDays;
  let reason = `按方案复诊节奏：每 ${plan.revisitWeeks} 周（${cycleDays} 天）一次`;

  if (plan.type === 'INVISIBLE' && plan.totalAligners) {
    const cur = plan.currentAligner || 0;
    const perDays = plan.alignerDays || 10;
    if (labMaxAligner && labMaxAligner > cur) {
      const remainDays = (labMaxAligner - cur) * perDays;
      daysAhead = Math.min(cycleDays, remainDays);
      reason =
        `当前第 ${cur}/${plan.totalAligners} 副（每副 ${perDays} 天），手中矫治器至第 ${labMaxAligner} 副，` +
        `约可戴 ${remainDays} 天；与复诊节奏 ${cycleDays} 天取较早者 → ${daysAhead} 天后复诊`;
    } else {
      reason = `当前第 ${cur}/${plan.totalAligners} 副（每副 ${perDays} 天），按复诊节奏 ${cycleDays} 天`;
    }
  }

  const computed = new Date(base);
  computed.setDate(computed.getDate() + daysAhead);
  const targetDate = computed > soon ? computed : soon;
  if (computed <= now) {
    reason += '；节点已过，患者复诊已延迟，建议尽快安排';
  }
  return { type: '复诊', durationMin: TYPE_DURATION['复诊'], targetDate, reason, pendingItems };
}
