import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { currentStage } from '../../common/plan.util';
import { PrismaService } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';
import { ExceptionsService } from '../exceptions/exceptions.service';
import { ScheduleService } from '../schedule/schedule.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class VisitsService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private exceptions: ExceptionsService,
    private scheduling: ScheduleService,
    private payments: PaymentsService,
  ) {}

  /** 护士核验：佩戴时长/口腔卫生/附件脱落/牙套丢失/疼痛不适/付款阶段 */
  async nurseCheck(appointmentId: string, body: any, user: any) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { plan: { include: { stages: true } }, patient: true },
    });
    if (!appt) throw new NotFoundException('预约不存在');
    if (!['SCHEDULED', 'ARRIVED'].includes(appt.status)) {
      throw new BadRequestException('当前预约状态不可进行护士核验');
    }
    const stage = currentStage(appt.plan as any);
    const visit = await this.prisma.$transaction(async (tx) => {
      const v = await tx.visitRecord.upsert({
        where: { appointmentId },
        create: {
          appointmentId,
          patientId: appt.patientId,
          planId: appt.planId,
          stageId: stage?.id || appt.stageId || null,
        },
        update: {},
      });
      const updated = await tx.visitRecord.update({
        where: { id: v.id },
        data: {
          wearHours: body.wearHours != null ? Number(body.wearHours) : null,
          hygiene: body.hygiene || null,
          attachmentLost: Number(body.attachmentLost) || 0,
          alignerLost: !!body.alignerLost,
          painLevel: body.painLevel != null ? Number(body.painLevel) : null,
          discomfort: body.discomfort || null,
          paymentChecked: !!body.paymentChecked,
          nurseNote: body.nurseNote || null,
          nurseId: user.sub,
          nurseAt: new Date(),
          stageId: stage?.id || appt.stageId || null,
        },
      });
      await tx.appointment.update({ where: { id: appointmentId }, data: { status: 'NURSE_DONE' } });
      return updated;
    });

    // ---- 异常联动 ----
    const plan = appt.plan;
    // 1) 附件多次脱落：累计 >= 3 颗立案
    const lost = Number(body.attachmentLost) || 0;
    if (lost > 0) {
      const agg = await this.prisma.visitRecord.aggregate({
        _sum: { attachmentLost: true },
        where: { planId: plan.id },
      });
      const total = agg._sum.attachmentLost || 0;
      if (total >= 3) {
        await this.exceptions.raise({
          patientId: appt.patientId,
          planId: plan.id,
          stageId: visit.stageId || undefined,
          appointmentId,
          type: 'ATTACHMENT_REPEATED',
          title: `附件多次脱落（累计 ${total} 颗）`,
          detail: `本次复诊脱落 ${lost} 颗，累计 ${total} 颗，需医生评估粘接方案。`,
          createdBy: user.sub,
        });
      }
    }
    // 2) 牙套丢失：立案 + 自动下补制技工单
    if (body.alignerLost) {
      await this.exceptions.raise({
        patientId: appt.patientId,
        planId: plan.id,
        stageId: visit.stageId || undefined,
        appointmentId,
        type: 'ALIGNER_LOST',
        title: `患者牙套丢失（当前第 ${plan.currentAligner} 副）`,
        detail: body.discomfort || '患者自述牙套丢失',
        createdBy: user.sub,
      });
      if (plan.type === 'INVISIBLE') {
        await this.prisma.labOrder.create({
          data: {
            patientId: appt.patientId,
            planId: plan.id,
            stageId: visit.stageId || null,
            type: 'REPAIR',
            alignerFrom: plan.currentAligner,
            alignerTo: plan.currentAligner,
            note: `牙套丢失补制第 ${plan.currentAligner} 副`,
            requestedBy: user.sub,
          },
        });
      }
    }
    // 3) 付款阶段核验：触发逾期扫描
    if (body.paymentChecked) {
      await this.payments.sweepOverdue(appt.patientId, user.sub);
    }

    await this.timeline.log(appt.patientId, '复诊', '护士核验完成', {
      stageId: visit.stageId || undefined,
      detail: `佩戴 ${body.wearHours ?? '-'}h/天，卫生 ${body.hygiene ?? '-'}，附件脱落 ${lost}，疼痛 ${body.painLevel ?? '-'}/10`,
      actorId: user.sub,
    });
    return visit;
  }

  /** 医生结论：复诊结论/进入下一副/重启方案/追加拍片/材料/医嘱，并自动预约下次 */
  async doctorConclusion(appointmentId: string, body: any, user: any) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { plan: { include: { stages: true } }, visit: true, patient: true },
    });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.status !== 'NURSE_DONE') throw new BadRequestException('请先完成护士核验');
    const plan = appt.plan;
    const stage = currentStage(plan as any);
    const stageId = stage?.id || appt.stageId || null;
    const createdExceptions: any[] = [];

    // 1) 更新复诊记录（医生部分）
    const visit = await this.prisma.visitRecord.update({
      where: { appointmentId },
      data: {
        movementOk: body.movementOk ?? null,
        conclusion: body.conclusion || null,
        advanceAligner: !!body.advanceAligner,
        restart: !!body.restart,
        needImaging: !!body.needImaging,
        completePlan: !!body.completePlan,
        doctorAdvice: body.doctorAdvice || null,
        doctorId: user.sub,
        doctorAt: new Date(),
      },
    });

    // 2) 材料登记（锚定阶段）
    if (Array.isArray(body.materials)) {
      for (const m of body.materials) {
        if (!m?.name) continue;
        await this.prisma.materialUsage.create({
          data: { visitId: visit.id, stageId, name: m.name, qty: Number(m.qty) || 1, unit: m.unit || '件' },
        });
      }
    }

    // 3) 进入下一副
    let alignerNote = '';
    if (body.advanceAligner && plan.type === 'INVISIBLE' && !body.restart && !body.completePlan) {
      const cur = Math.min((plan.currentAligner || 0) + 1, plan.totalAligners || 9999);
      await this.prisma.treatmentPlan.update({ where: { id: plan.id }, data: { currentAligner: cur } });
      alignerNote = `进入第 ${cur} 副`;
      // 跨越阶段边界 → 当前阶段 DONE
      if (stage && stage.alignerTo != null && cur > stage.alignerTo) {
        await this.prisma.treatmentStage.update({ where: { id: stage.id }, data: { status: 'DONE' } });
      }
    }

    // 4) 牙齿移动不达标
    if (body.movementOk === false) {
      createdExceptions.push(
        await this.exceptions.raise({
          patientId: appt.patientId,
          planId: plan.id,
          stageId: stageId || undefined,
          appointmentId,
          type: 'MOVEMENT_OFF_TRACK',
          title: '牙齿移动不达标',
          detail: body.conclusion || '医生复诊判断牙齿移动未达预期',
          createdBy: user.sub,
        }),
      );
    }

    // 5) 重启方案：新阶段 + 技工单 + 异常（医生/技工所/前台协同）
    if (body.restart) {
      const restartCount = plan.restartCount + 1;
      const newTotal = Number(body.newTotalAligners) || plan.totalAligners || null;
      await this.prisma.$transaction(async (tx) => {
        await tx.treatmentStage.updateMany({ where: { planId: plan.id, status: 'ACTIVE' }, data: { status: 'DONE' } });
        await tx.treatmentStage.create({
          data: {
            planId: plan.id,
            seq: plan.stages.length + 1,
            name: `重启阶段 R${restartCount}${newTotal ? `（第 1-${newTotal} 副）` : ''}`,
            alignerFrom: 1,
            alignerTo: newTotal,
          },
        });
        await tx.treatmentPlan.update({
          where: { id: plan.id },
          data: { restartCount, currentAligner: 0, totalAligners: newTotal },
        });
        await tx.labOrder.create({
          data: {
            patientId: appt.patientId,
            planId: plan.id,
            stageId,
            type: 'RESTART_MAKE',
            alignerFrom: 1,
            alignerTo: newTotal,
            note: `第 ${restartCount} 次重启制作`,
            requestedBy: user.sub,
          },
        });
      });
      createdExceptions.push(
        await this.exceptions.raise({
          patientId: appt.patientId,
          planId: plan.id,
          stageId,
          appointmentId,
          type: 'PLAN_RESTART',
          title: `方案重启（第 ${restartCount} 次）`,
          detail: body.conclusion || '医生决定重启方案，重新取模制作',
          impactDays: 21,
          createdBy: user.sub,
        }),
      );
    }

    // 6) 追加拍片
    if (body.needImaging || body.restart) {
      await this.timeline.log(appt.patientId, '医嘱', '医嘱：追加拍片/取模', {
        stageId: stageId || undefined,
        detail: body.conclusion || undefined,
        actorId: user.sub,
      });
    }

    // 7) 治疗完成 → 保持器交付流程
    if (body.completePlan) {
      await this.prisma.$transaction(async (tx) => {
        await tx.treatmentPlan.update({ where: { id: plan.id }, data: { status: 'COMPLETED' } });
        await tx.treatmentStage.updateMany({ where: { planId: plan.id }, data: { status: 'DONE' } });
        await tx.labOrder.create({
          data: {
            patientId: appt.patientId,
            planId: plan.id,
            stageId,
            type: 'RETAINER',
            note: '治疗完成，制作保持器',
            requestedBy: user.sub,
          },
        });
      });
      await this.timeline.log(appt.patientId, '方案', '治疗完成，进入保持器交付流程', {
        stageId: stageId || undefined,
        actorId: user.sub,
      });
    }

    // 8) 预约完成
    await this.prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } });

    // 8.1) 处置类预约完成后回写治疗计划项（影响后续智能排期建议）
    const planPatch: any = {};
    if (appt.type === '拔牙' && Array.isArray(plan.extractions)) {
      planPatch.extractions = (plan.extractions as any[]).map((e) => ({ ...e, done: true }));
    }
    if (appt.type === '片切' && Array.isArray(plan.ipr)) {
      planPatch.ipr = (plan.ipr as any[]).map((i) => ({ ...i, done: true }));
    }
    if (appt.type === '粘附件' && Array.isArray(plan.attachments)) {
      planPatch.attachments = (plan.attachments as any[]).map((a) => ({ ...a, bonded: true }));
    }
    if (Object.keys(planPatch).length) {
      await this.prisma.treatmentPlan.update({ where: { id: plan.id }, data: planPatch });
      await this.timeline.log(appt.patientId, '方案', `临床项执行完成：${appt.type}`, {
        stageId: stageId || undefined,
        actorId: user.sub,
      });
    }

    // 9) 自动预约下次复诊：类型/时长/节点由临床规则按最新计划推导（完成/重启除外）
    let nextAppointment = null;
    if (!body.completePlan && !body.restart) {
      const clinical = await this.scheduling.getClinicalContext(appt.patientId);
      nextAppointment = await this.scheduling.autoBookNext(
        appt.patientId,
        clinical.targetDate,
        clinical.durationMin,
        clinical.type,
        user.sub,
      );
      if (!nextAppointment) {
        createdExceptions.push(
          await this.exceptions.raise({
            patientId: appt.patientId,
            planId: plan.id,
            stageId: stageId || undefined,
            type: 'OTHER',
            title: '下次复诊自动排期失败',
            detail: '目标日期 14 天内无可用槽位，请前台人工安排。',
            createdBy: user.sub,
            tasks: [{ role: 'RECEPTION', note: '人工安排下次复诊时间' }],
          }),
        );
      }
    }

    await this.timeline.log(
      appt.patientId,
      '复诊',
      `复诊完成${alignerNote ? `：${alignerNote}` : ''}`,
      {
        stageId: stageId || undefined,
        detail: [body.conclusion, body.doctorAdvice ? `医嘱：${body.doctorAdvice}` : null].filter(Boolean).join('；'),
        actorId: user.sub,
      },
    );

    return { visit, nextAppointment, exceptions: createdExceptions };
  }
}
