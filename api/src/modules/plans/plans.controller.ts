import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';
import { PLAN_TYPE_RULES } from '../../common/plan.util';

@Controller()
export class PlansController {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
  ) {}

  @Get('plans/rules')
  rules() {
    return PLAN_TYPE_RULES;
  }

  @Get('plans/:id')
  async detail(@Param('id') id: string) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: {
        doctor: { select: { id: true, name: true } },
        patient: { select: { id: true, name: true, mrn: true } },
        stages: { orderBy: { seq: 'asc' } },
        payments: { orderBy: { seq: 'asc' } },
        parent: { select: { id: true, type: true, version: true } },
        children: { select: { id: true, type: true, version: true, status: true } },
      },
    });
    if (!plan) throw new NotFoundException('方案不存在');
    return plan;
  }

  /**
   * 建档/换方案：同一患者已有 ACTIVE 方案时必须给出 switchReason，
   * 旧方案置为 SWITCHED（历史保留），新方案 version+1 并挂到方案链上。
   */
  @Post('patients/:id/plans')
  @Roles('DOCTOR', 'RECEPTION')
  async create(@Param('id') patientId: string, @Body() body: any, @CurrentUser() user: any) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { plans: { where: { status: 'ACTIVE' } } },
    });
    if (!patient) throw new NotFoundException('患者不存在');
    if (!body.type || !body.doctorId || !body.expectedMonths) {
      throw new BadRequestException('方案类型/负责医生/预计周期必填');
    }
    const old = patient.plans[0];
    if (old && !body.switchReason) {
      throw new BadRequestException('该患者已有在治方案，换方案必须填写原因（历史方案将保留）');
    }
    if (body.type === 'INVISIBLE' && !body.totalAligners) {
      throw new BadRequestException('隐形矫治必须填写矫治器总副数');
    }

    const rules = PLAN_TYPE_RULES[body.type];
    const expectedEnd = new Date();
    expectedEnd.setMonth(expectedEnd.getMonth() + Number(body.expectedMonths));

    const plan = await this.prisma.$transaction(async (tx) => {
      if (old) {
        await tx.treatmentPlan.update({
          where: { id: old.id },
          data: { status: 'SWITCHED', switchReason: body.switchReason },
        });
        await tx.treatmentStage.updateMany({ where: { planId: old.id }, data: { status: 'DONE' } });
      }
      const created = await tx.treatmentPlan.create({
        data: {
          patientId,
          doctorId: body.doctorId,
          type: body.type,
          version: old ? old.version + 1 : 1,
          parentId: old?.id || null,
          totalAligners: body.totalAligners ? Number(body.totalAligners) : null,
          currentAligner: 0,
          alignerDays: body.alignerDays ? Number(body.alignerDays) : rules?.alignerDays || null,
          revisitWeeks: Number(body.revisitWeeks) || rules?.revisitWeeks || 6,
          attachments: body.attachments?.length ? body.attachments : null,
          extractions: body.extractions?.length ? body.extractions : null,
          ipr: body.ipr?.length ? body.ipr : null,
          expectedMonths: Number(body.expectedMonths),
          totalFee: Number(body.totalFee) || 0,
          expectedEnd,
          note: body.note || null,
        },
      });
      // 治疗阶段：隐形按每 10 副一个阶段；固定/早矫为单一主阶段
      if (body.type === 'INVISIBLE') {
        const total = Number(body.totalAligners);
        const n = Math.ceil(total / 10);
        for (let i = 0; i < n; i++) {
          await tx.treatmentStage.create({
            data: {
              planId: created.id,
              seq: i + 1,
              name: `第 ${i + 1} 阶段（第 ${i * 10 + 1}-${Math.min((i + 1) * 10, total)} 副）`,
              alignerFrom: i * 10 + 1,
              alignerTo: Math.min((i + 1) * 10, total),
            },
          });
        }
      } else {
        await tx.treatmentStage.create({
          data: { planId: created.id, seq: 1, name: body.type === 'FIXED' ? '主治疗阶段' : '早矫一期' },
        });
      }
      // 收费阶段
      if (Array.isArray(body.paymentStages)) {
        let seq = 1;
        for (const ps of body.paymentStages) {
          if (!ps.name || !ps.amount || !ps.dueDate) continue;
          await tx.paymentStage.create({
            data: {
              patientId,
              planId: created.id,
              name: ps.name,
              seq: seq++,
              amount: Number(ps.amount),
              dueDate: new Date(ps.dueDate),
            },
          });
        }
      }
      // 负责医生关系
      await tx.patient.update({ where: { id: patientId }, data: { primaryDoctorId: body.doctorId } });
      return created;
    });

    await this.timeline.log(
      patientId,
      old ? '换方案' : '方案',
      old
        ? `换方案：${PLAN_TYPE_RULES[body.type] ? '' : ''}新方案 v${plan.version}（${body.type}），原方案 v${old.version} 保留`
        : `创建治疗方案 v1（${body.type}）`,
      { detail: body.switchReason || body.note, actorId: user.sub },
    );
    return plan;
  }

  /** 转诊：更换负责医生需留痕，防止跨医生复诊无法解释方案 */
  @Post('plans/:id/transfer')
  @Roles('DOCTOR')
  async transfer(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    if (!body.doctorId || !body.reason) throw new BadRequestException('转诊需指定新医生并填写原因');
    const plan = await this.prisma.treatmentPlan.findUnique({ where: { id }, include: { doctor: true } });
    if (!plan) throw new NotFoundException('方案不存在');
    const doctor = await this.prisma.user.findUnique({ where: { id: body.doctorId } });
    if (!doctor || doctor.role !== 'DOCTOR') throw new BadRequestException('目标医生无效');
    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.treatmentPlan.update({ where: { id }, data: { doctorId: doctor.id } });
      await tx.patient.update({ where: { id: plan.patientId }, data: { primaryDoctorId: doctor.id } });
      return p;
    });
    await this.timeline.log(plan.patientId, '转诊', `转诊：${plan.doctor.name} → ${doctor.name}`, {
      detail: body.reason,
      actorId: user.sub,
    });
    return updated;
  }
}
