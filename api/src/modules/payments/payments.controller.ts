import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(
    private prisma: PrismaService,
    private svc: PaymentsService,
  ) {}

  @Get('payments')
  async list(@Query('status') status?: string, @Query('patientId') patientId?: string) {
    await this.svc.sweepOverdue(); // 读取时自动标记逾期
    return this.prisma.paymentStage.findMany({
      where: { status: status ? (status as any) : undefined, patientId: patientId || undefined },
      include: {
        patient: { select: { id: true, name: true, mrn: true } },
        plan: { select: { id: true, type: true, version: true } },
        stage: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'desc' }, { dueDate: 'asc' }],
      take: 300,
    });
  }

  @Get('payments/summary')
  async summary() {
    await this.svc.sweepOverdue();
    const [pending, paid, overdue] = await Promise.all([
      this.prisma.paymentStage.aggregate({ _sum: { amount: true }, _count: true, where: { status: 'PENDING' } }),
      this.prisma.paymentStage.aggregate({ _sum: { amount: true }, _count: true, where: { status: 'PAID' } }),
      this.prisma.paymentStage.aggregate({ _sum: { amount: true }, _count: true, where: { status: 'OVERDUE' } }),
    ]);
    return {
      pending: { count: pending._count, amount: pending._sum.amount || 0 },
      paid: { count: paid._count, amount: paid._sum.amount || 0 },
      overdue: { count: overdue._count, amount: overdue._sum.amount || 0 },
    };
  }

  @Post('payments/:id/pay')
  @Roles('FINANCE', 'RECEPTION')
  pay(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.pay(id, body.method, user.sub);
  }

  @Post('payments/:id/waive')
  @Roles('FINANCE')
  async waive(@Param('id') id: string, @CurrentUser() user: any) {
    const p = await this.prisma.paymentStage.update({ where: { id }, data: { status: 'WAIVED' } });
    return p;
  }

  @Post('plans/:id/payments')
  @Roles('FINANCE', 'RECEPTION', 'DOCTOR')
  async addStage(@Param('id') planId: string, @Body() body: any) {
    if (!body.name || !body.amount || !body.dueDate) throw new BadRequestException('名称/金额/到期日必填');
    const plan = await this.prisma.treatmentPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('方案不存在');
    const count = await this.prisma.paymentStage.count({ where: { planId } });
    return this.prisma.paymentStage.create({
      data: {
        patientId: plan.patientId,
        planId,
        name: body.name,
        seq: count + 1,
        amount: Number(body.amount),
        dueDate: new Date(body.dueDate),
      },
    });
  }
}
