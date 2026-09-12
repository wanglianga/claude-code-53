import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';

const FLOW: Record<string, string[]> = {
  REQUESTED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['RECEIVED'],
  RECEIVED: [],
  CANCELLED: [],
};

@Controller('lab-orders')
export class LabController {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
  ) {}

  @Get()
  list(@Query('status') status?: string, @Query('patientId') patientId?: string) {
    return this.prisma.labOrder.findMany({
      where: { status: status ? (status as any) : undefined, patientId: patientId || undefined },
      include: {
        patient: { select: { id: true, name: true, mrn: true } },
        plan: { select: { id: true, type: true, version: true } },
        stage: { select: { id: true, name: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
    });
  }

  @Post()
  @Roles('LAB', 'NURSE', 'DOCTOR', 'RECEPTION')
  async create(@Body() body: any, @CurrentUser() user: any) {
    if (!body.patientId || !body.type) throw new BadRequestException('患者与单据类型必填');
    const patient = await this.prisma.patient.findUnique({
      where: { id: body.patientId },
      include: { plans: { where: { status: 'ACTIVE' }, include: { stages: { where: { status: 'ACTIVE' } } } } },
    });
    if (!patient) throw new NotFoundException('患者不存在');
    const plan = patient.plans[0];
    if (!plan) throw new BadRequestException('患者没有在治方案');
    const order = await this.prisma.labOrder.create({
      data: {
        patientId: patient.id,
        planId: plan.id,
        stageId: plan.stages[0]?.id || null,
        type: body.type,
        alignerFrom: body.alignerFrom != null ? Number(body.alignerFrom) : null,
        alignerTo: body.alignerTo != null ? Number(body.alignerTo) : null,
        labName: body.labName || null,
        note: body.note || null,
        requestedBy: user.sub,
      },
    });
    await this.timeline.log(patient.id, '技工', `技工单开立（${body.type}）`, {
      stageId: order.stageId || undefined,
      detail: body.note,
      actorId: user.sub,
    });
    return order;
  }

  @Patch(':id')
  @Roles('LAB', 'NURSE', 'RECEPTION')
  async transition(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    const order = await this.prisma.labOrder.findUnique({ where: { id }, include: { patient: true } });
    if (!order) throw new NotFoundException('技工单不存在');
    const next = body.status as string;
    if (!FLOW[order.status]?.includes(next)) {
      throw new BadRequestException(`不允许从 ${order.status} 流转到 ${next}`);
    }
    const updated = await this.prisma.labOrder.update({
      where: { id },
      data: {
        status: next as any,
        labName: body.labName ?? order.labName,
        trackingNo: body.trackingNo ?? order.trackingNo,
        shippedAt: next === 'SHIPPED' ? new Date() : undefined,
        receivedAt: next === 'RECEIVED' ? new Date() : undefined,
      },
    });
    const label: Record<string, string> = {
      IN_PRODUCTION: '已接单制作',
      SHIPPED: `技工所已发货${updated.trackingNo ? `（单号 ${updated.trackingNo}）` : ''}`,
      RECEIVED: '已到件签收',
      CANCELLED: '已取消',
    };
    await this.timeline.log(order.patientId, '技工', `技工单${label[next] || next}`, {
      stageId: order.stageId || undefined,
      detail: order.note || undefined,
      actorId: user.sub,
    });
    return updated;
  }
}
