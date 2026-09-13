import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Appointment } from '@prisma/client';
import { addDays, dayStart, overlap, parseDay } from '../../common/date.util';
import { currentStage } from '../../common/plan.util';
import { PrismaService } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';
import { ExceptionsService } from '../exceptions/exceptions.service';
import { ClinicalContext, computeClinicalContext } from './clinical.util';

const ACTIVE_STATUSES = ['SCHEDULED', 'ARRIVED', 'NURSE_DONE'] as const;

@Injectable()
export class ScheduleService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private exceptions: ExceptionsService,
  ) {}

  /**
   * 临床上下文：由治疗计划（当前副数/附件/拔牙/片切）推导
   * 建议预约类型、占用时长与复诊节点。
   */
  async getClinicalContext(patientId: string): Promise<ClinicalContext & { doctorId: string }> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { plans: { where: { status: 'ACTIVE' } } },
    });
    if (!patient) throw new NotFoundException('患者不存在');
    const plan = patient.plans[0];
    if (!plan) throw new BadRequestException('该患者没有在治方案，请先建档制定方案');

    const [lastVisit, labBatches] = await Promise.all([
      this.prisma.appointment.findFirst({
        where: { planId: plan.id, status: 'COMPLETED' },
        orderBy: { startAt: 'desc' },
        select: { startAt: true },
      }),
      this.prisma.labOrder.findMany({
        where: {
          planId: plan.id,
          type: { in: ['ALIGNER_BATCH', 'RESTART_MAKE'] },
          status: { in: ['SHIPPED', 'RECEIVED'] },
          alignerTo: { not: null },
        },
        select: { alignerTo: true },
      }),
    ]);
    const labMaxAligner = labBatches.length ? Math.max(...labBatches.map((b) => b.alignerTo || 0)) : null;
    const ctx = computeClinicalContext({ plan, lastVisitAt: lastVisit?.startAt || null, labMaxAligner });
    return { ...ctx, doctorId: plan.doctorId };
  }


  /** 计算某医生在某日期段的可用槽位（考虑排班、请假、既有预约、椅位占用） */
  async suggestSlots(opts: {
    doctorId: string;
    fromDate: Date;
    days: number;
    durationMin: number;
    period?: 'AM' | 'PM';
    limit?: number;
  }) {
    const { doctorId, durationMin } = opts;
    const limit = opts.limit || 12;
    const [schedules, leaves, chairs] = await Promise.all([
      this.prisma.doctorSchedule.findMany({ where: { doctorId } }),
      this.prisma.doctorLeave.findMany({ where: { doctorId } }),
      this.prisma.chair.findMany({ where: { active: true } }),
    ]);
    if (!chairs.length) throw new BadRequestException('没有可用椅位，请先在系统管理中添加');
    const from = dayStart(opts.fromDate);
    const to = addDays(from, opts.days);
    const existing = await this.prisma.appointment.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        startAt: { lt: to },
        endAt: { gt: from },
        OR: [{ doctorId }, { chairId: { in: chairs.map((c) => c.id) } }],
      },
    });
    const now = new Date();
    const slots: any[] = [];
    for (let d = 0; d < opts.days && slots.length < limit; d++) {
      const day = addDays(from, d);
      // 请假日跳过
      const onLeave = leaves.some((l) => overlap(day, addDays(day, 1), dayStart(l.startDate), addDays(dayStart(l.endDate), 1)));
      if (onLeave) continue;
      const wd = day.getDay();
      const windows = schedules.filter((s) => s.weekday === wd);
      for (const w of windows) {
        let t = new Date(day.getTime() + w.startMin * 60000);
        const wEnd = new Date(day.getTime() + w.endMin * 60000);
        while (t.getTime() + durationMin * 60000 <= wEnd.getTime() && slots.length < limit) {
          const slotStart = new Date(t);
          const slotEnd = new Date(t.getTime() + durationMin * 60000);
          t = new Date(t.getTime() + 30 * 60000); // 30 分钟步进
          if (slotEnd <= now) continue; // 过去的时间不可约
          const hour = slotStart.getHours();
          if (opts.period === 'AM' && hour >= 12) continue;
          if (opts.period === 'PM' && hour < 12) continue;
          // 医生冲突
          const doctorBusy = existing.some(
            (a) => a.doctorId === doctorId && overlap(a.startAt, a.endAt, slotStart, slotEnd),
          );
          if (doctorBusy) continue;
          // 找一把空闲椅位
          const chair = chairs.find(
            (c) => !existing.some((a) => a.chairId === c.id && overlap(a.startAt, a.endAt, slotStart, slotEnd)),
          );
          if (!chair) continue;
          slots.push({ startAt: slotStart, endAt: slotEnd, chairId: chair.id, chairName: chair.name, doctorId });
        }
      }
    }
    return slots;
  }

  /** 校验并创建预约（同一患者固定由方案负责医生接诊，防止跨医生复诊） */
  async book(opts: {
    patientId: string;
    startAt: Date;
    durationMin: number;
    type?: string;
    note?: string;
    actorId?: string;
    skipWindowCheck?: boolean;
  }) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: opts.patientId },
      include: { plans: { where: { status: 'ACTIVE' }, include: { stages: true } } },
    });
    if (!patient) throw new NotFoundException('患者不存在');
    const plan = patient.plans[0];
    if (!plan) throw new BadRequestException('该患者没有在治方案，请先建档制定方案');
    const doctorId = plan.doctorId;
    const startAt = opts.startAt;
    const endAt = new Date(startAt.getTime() + opts.durationMin * 60000);

    // 医生出诊窗口校验
    if (!opts.skipWindowCheck) {
      const wd = startAt.getDay();
      const schedules = await this.prisma.doctorSchedule.findMany({ where: { doctorId, weekday: wd } });
      const day = dayStart(startAt);
      const inWindow = schedules.some(
        (s) =>
          startAt >= new Date(day.getTime() + s.startMin * 60000) &&
          endAt <= new Date(day.getTime() + s.endMin * 60000),
      );
      if (!inWindow) throw new BadRequestException('该时间不在医生出诊时间内');
      const leaves = await this.prisma.doctorLeave.findMany({ where: { doctorId } });
      const onLeave = leaves.some((l) => overlap(startAt, endAt, dayStart(l.startDate), addDays(dayStart(l.endDate), 1)));
      if (onLeave) throw new BadRequestException('医生该日请假，无法预约');
    }

    // 冲突检查 + 分配椅位（事务内串行创建，避免并发双占）
    const appt = await this.prisma.$transaction(async (tx) => {
      const doctorBusy = await tx.appointment.findFirst({
        where: { doctorId, status: { in: [...ACTIVE_STATUSES] }, startAt: { lt: endAt }, endAt: { gt: startAt } },
      });
      if (doctorBusy) throw new BadRequestException('医生该时段已有预约');
      const chairs = await tx.chair.findMany({ where: { active: true } });
      let chairId: string | null = null;
      for (const c of chairs) {
        const busy = await tx.appointment.findFirst({
          where: { chairId: c.id, status: { in: [...ACTIVE_STATUSES] }, startAt: { lt: endAt }, endAt: { gt: startAt } },
        });
        if (!busy) {
          chairId = c.id;
          break;
        }
      }
      if (!chairId) throw new BadRequestException('该时段椅位已满');
      const stage = currentStage(plan as any);
      return tx.appointment.create({
        data: {
          patientId: patient.id,
          planId: plan.id,
          stageId: stage?.id || null,
          doctorId,
          chairId,
          startAt,
          endAt,
          type: opts.type || '复诊',
          note: opts.note || null,
        },
        include: { chair: true, doctor: { select: { name: true } } },
      });
    });

    await this.timeline.log(patient.id, '预约', `预约${appt.type}：${startAt.toLocaleString('zh-CN')}（${appt.doctor.name} / ${appt.chair?.name}）`, {
      stageId: appt.stageId || undefined,
      actorId: opts.actorId,
    });
    return appt;
  }

  /** 医生结论后自动预约下次复诊：目标日起 14 天内第一个可用槽位 */
  async autoBookNext(patientId: string, targetDate: Date, durationMin: number, type: string, actorId?: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { plans: { where: { status: 'ACTIVE' } } },
    });
    if (!patient?.plans[0]) return null;
    const slots = await this.suggestSlots({
      doctorId: patient.plans[0].doctorId,
      fromDate: targetDate,
      days: 14,
      durationMin,
      limit: 1,
    });
    if (!slots.length) return null;
    return this.book({ patientId, startAt: slots[0].startAt, durationMin, type, actorId });
  }

  /** 患者临时延期：先成功订入新时段再取消原预约（避免改期失败丢失原预约） */
  async reschedule(appointmentId: string, newStartAt: Date | null, reason: string, byPatient: boolean, actorId: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId }, include: { patient: true } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (!['SCHEDULED', 'ARRIVED'].includes(appt.status)) throw new BadRequestException('当前状态不可改期');
    const durationMin = Math.round((appt.endAt.getTime() - appt.startAt.getTime()) / 60000);

    let next: Appointment | null = null;
    if (newStartAt) {
      // 先订新时段；失败则抛错，原预约保持不变
      next = await this.book({
        patientId: appt.patientId,
        startAt: newStartAt,
        durationMin,
        type: appt.type,
        note: appt.note || undefined,
        actorId,
      });
    }
    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED', cancelReason: `改期：${reason || '患者临时延期'}` },
    });
    const impactDays = newStartAt
      ? Math.max(0, Math.round((newStartAt.getTime() - appt.startAt.getTime()) / 86400000))
      : 0;
    if (byPatient) {
      await this.exceptions.raise({
        patientId: appt.patientId,
        planId: appt.planId,
        stageId: appt.stageId || undefined,
        appointmentId: appointmentId,
        type: 'PATIENT_DELAY',
        title: `患者临时延期（原 ${appt.startAt.toLocaleString('zh-CN')}）`,
        detail: reason || '患者临时有事，申请延期',
        impactDays,
        createdBy: actorId,
      });
    }
    await this.timeline.log(appt.patientId, '预约', `复诊改期：原 ${appt.startAt.toLocaleString('zh-CN')}`, {
      stageId: appt.stageId || undefined,
      detail: reason,
      actorId,
    });
    return { cancelled: appointmentId, next };
  }

  /** 医生请假：立案并列出受影响预约 */
  async createLeave(doctorId: string, startDate: Date, endDate: Date, reason: string, actorId: string) {
    const leave = await this.prisma.doctorLeave.create({ data: { doctorId, startDate, endDate, reason } });
    const affected = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        status: { in: ['SCHEDULED'] },
        startAt: { gte: dayStart(startDate), lte: addDays(dayStart(endDate), 1) },
      },
      include: { patient: { select: { id: true, name: true } } },
      orderBy: { startAt: 'asc' },
    });
    for (const a of affected) {
      await this.exceptions.raise({
        patientId: a.patientId,
        planId: a.planId,
        stageId: a.stageId || undefined,
        appointmentId: a.id,
        type: 'DOCTOR_LEAVE',
        title: `医生请假，需改期（${a.startAt.toLocaleString('zh-CN')}）`,
        detail: `请假原因：${reason || '未填写'}；受影响患者：${a.patient.name}`,
        createdBy: actorId,
        tasks: [{ role: 'RECEPTION', note: `为患者 ${a.patient.name} 改期（保持原负责医生）` }],
      });
    }
    return { leave, affected };
  }

  /** 一键改期：把请假影响的所有预约改到假期结束后的第一个可用槽位 */
  async autoRescheduleLeave(leaveId: string, actorId: string) {
    const leave = await this.prisma.doctorLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('请假记录不存在');
    const affected = await this.prisma.appointment.findMany({
      where: {
        doctorId: leave.doctorId,
        status: 'SCHEDULED',
        startAt: { gte: dayStart(leave.startDate), lte: addDays(dayStart(leave.endDate), 1) },
      },
      include: { patient: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
    });
    const results: any[] = [];
    for (const a of affected) {
      const durationMin = Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60000);
      const next = await this.autoBookNext(a.patientId, addDays(dayStart(leave.endDate), 1), durationMin, a.type, actorId);
      if (next) {
        await this.prisma.appointment.update({
          where: { id: a.id },
          data: { status: 'CANCELLED', cancelReason: '医生请假，系统一键改期' },
        });
        results.push({ patient: a.patient.name, from: a.startAt, to: next.startAt });
        // 自动完成该预约对应的改期任务并结案
        const ex = await this.prisma.exceptionCase.findFirst({
          where: { appointmentId: a.id, type: 'DOCTOR_LEAVE', status: { not: 'RESOLVED' } },
        });
        if (ex) await this.exceptions.resolve(ex.id, `已改期至 ${next.startAt.toLocaleString('zh-CN')}`, undefined, actorId);
      } else {
        results.push({ patient: a.patient.name, from: a.startAt, to: null, error: '14 天内无可用槽位，需人工跟进' });
      }
    }
    return results;
  }
}
