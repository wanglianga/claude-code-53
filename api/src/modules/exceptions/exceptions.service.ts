import { Injectable } from '@nestjs/common';
import { ExceptionType, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';

export interface TaskInput {
  role: Role;
  note: string;
  assigneeId?: string;
}

export interface RaiseInput {
  patientId: string;
  planId?: string;
  stageId?: string;
  appointmentId?: string;
  type: ExceptionType;
  title: string;
  detail?: string;
  impactDays?: number;
  createdBy?: string;
  tasks?: TaskInput[];
}

export const EXCEPTION_TYPE_LABEL: Record<string, string> = {
  PATIENT_DELAY: '患者临时延期',
  ALIGNER_BROKEN: '矫治器断裂',
  ALIGNER_LOST: '牙套丢失',
  ATTACHMENT_REPEATED: '附件多次脱落',
  MOVEMENT_OFF_TRACK: '牙齿移动不达标',
  DOCTOR_LEAVE: '医生请假',
  PAYMENT_OVERDUE: '付款逾期',
  PLAN_RESTART: '重启方案',
  OTHER: '其他',
};

// 各类异常的默认协同任务：把患者、医生、护士、技工所、财务串在同一治疗计划里
export function defaultTasksFor(type: ExceptionType): { role: Role; note: string }[] {
  switch (type) {
    case 'PATIENT_DELAY':
      return [{ role: 'RECEPTION', note: '联系患者确认新的复诊时间并改期' }];
    case 'ALIGNER_BROKEN':
      return [
        { role: 'LAB', note: '按当前副数补制矫治器' },
        { role: 'RECEPTION', note: '到件后通知患者到店更换' },
      ];
    case 'ALIGNER_LOST':
      return [
        { role: 'LAB', note: '补制当前副矫治器' },
        { role: 'RECEPTION', note: '联系患者确认丢失情况并预约取件' },
      ];
    case 'ATTACHMENT_REPEATED':
      return [{ role: 'DOCTOR', note: '评估附件粘接方案、牙面处理与医嘱' }];
    case 'MOVEMENT_OFF_TRACK':
      return [{ role: 'DOCTOR', note: '评估是否重启方案或调整佩戴计划' }];
    case 'DOCTOR_LEAVE':
      return [{ role: 'RECEPTION', note: '为受影响预约逐一改期（保持原负责医生）' }];
    case 'PAYMENT_OVERDUE':
      return [{ role: 'FINANCE', note: '联系患者催收逾期款项' }];
    case 'PLAN_RESTART':
      return [
        { role: 'DOCTOR', note: '确认重启方案（新副数/新阶段）' },
        { role: 'LAB', note: '按重启方案重新制作矫治器' },
        { role: 'RECEPTION', note: '重启件到所后安排复诊' },
      ];
    default:
      return [{ role: 'RECEPTION', note: '跟进处理' }];
  }
}

@Injectable()
export class ExceptionsService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
  ) {}

  /** 立案异常；同一患者同类型存在未结异常时默认去重（追加详情） */
  async raise(input: RaiseInput, dedupeOpen = true) {
    if (dedupeOpen) {
      const existing = await this.prisma.exceptionCase.findFirst({
        where: { patientId: input.patientId, type: input.type, status: { not: 'RESOLVED' } },
      });
      if (existing) {
        return this.prisma.exceptionCase.update({
          where: { id: existing.id },
          data: {
            detail: `${existing.detail || ''}\n[${new Date().toLocaleString('zh-CN')}] ${input.detail || input.title}`.trim(),
            impactDays: Math.max(existing.impactDays, input.impactDays || 0),
          },
          include: { tasks: true },
        });
      }
    }
    const tasks: TaskInput[] = input.tasks ?? defaultTasksFor(input.type);
    const created = await this.prisma.exceptionCase.create({
      data: {
        patientId: input.patientId,
        planId: input.planId || null,
        stageId: input.stageId || null,
        appointmentId: input.appointmentId || null,
        type: input.type,
        title: input.title,
        detail: input.detail || null,
        impactDays: input.impactDays || 0,
        createdBy: input.createdBy || null,
        tasks: { create: tasks.map((t) => ({ assigneeRole: t.role, note: t.note, assigneeId: t.assigneeId || null })) },
      },
      include: { tasks: true },
    });
    await this.timeline.log(input.patientId, '异常', `异常立案：${input.title}`, {
      stageId: input.stageId,
      detail: input.detail,
      actorId: input.createdBy,
    });
    return created;
  }

  async resolve(id: string, resolution: string, impactDays: number | undefined, actorId: string) {
    const ex = await this.prisma.exceptionCase.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolution,
        resolvedAt: new Date(),
        impactDays: impactDays ?? undefined,
        tasks: { updateMany: { where: { done: false }, data: { done: true, doneAt: new Date(), doneBy: actorId } } },
      },
      include: { tasks: true },
    });
    await this.timeline.log(ex.patientId, '异常', `异常结案：${ex.title}`, {
      stageId: ex.stageId || undefined,
      detail: resolution,
      actorId,
    });
    return ex;
  }
}
