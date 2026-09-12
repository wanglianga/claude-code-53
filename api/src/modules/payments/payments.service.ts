import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';
import { ExceptionsService } from '../exceptions/exceptions.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private exceptions: ExceptionsService,
  ) {}

  /** 逾期扫描：到期未付 → OVERDUE，并立案（财务协同） */
  async sweepOverdue(patientId?: string, actorId?: string) {
    const overdue = await this.prisma.paymentStage.findMany({
      where: { status: 'PENDING', dueDate: { lt: new Date() }, patientId: patientId || undefined },
      include: { patient: { select: { name: true } }, plan: { include: { stages: { where: { status: 'ACTIVE' } } } } },
    });
    for (const p of overdue) {
      await this.prisma.paymentStage.update({ where: { id: p.id }, data: { status: 'OVERDUE' } });
      await this.exceptions.raise({
        patientId: p.patientId,
        planId: p.planId,
        stageId: p.stageId || p.plan.stages[0]?.id,
        type: 'PAYMENT_OVERDUE',
        title: `付款逾期：${p.name} ¥${p.amount}`,
        detail: `患者 ${p.patient.name} 的「${p.name}」应于 ${p.dueDate.toLocaleDateString('zh-CN')} 前支付，现已逾期。`,
        createdBy: actorId,
      });
    }
    return overdue.length;
  }

  /** 收款；若该患者已无逾期，自动结掉付款逾期异常 */
  async pay(id: string, method: string, operatorId: string) {
    const payment = await this.prisma.paymentStage.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), method: method || '扫码', operatorId },
      include: { patient: true },
    });
    await this.timeline.log(payment.patientId, '收费', `收款：${payment.name} ¥${payment.amount}`, {
      stageId: payment.stageId || undefined,
      detail: `支付方式：${payment.method}`,
      actorId: operatorId,
    });
    const remaining = await this.prisma.paymentStage.count({
      where: { patientId: payment.patientId, status: 'OVERDUE' },
    });
    if (remaining === 0) {
      const open = await this.prisma.exceptionCase.findMany({
        where: { patientId: payment.patientId, type: 'PAYMENT_OVERDUE', status: { not: 'RESOLVED' } },
      });
      for (const ex of open) {
        await this.exceptions.resolve(ex.id, '逾期款项已收齐', undefined, operatorId);
      }
    }
    return payment;
  }
}
