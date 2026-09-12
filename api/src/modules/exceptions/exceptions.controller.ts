import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ExceptionType } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { defaultTasksFor, ExceptionsService } from './exceptions.service';

@Controller('exceptions')
export class ExceptionsController {
  constructor(
    private prisma: PrismaService,
    private svc: ExceptionsService,
  ) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.prisma.exceptionCase.findMany({
      where: {
        status: status ? (status as any) : undefined,
        type: type ? (type as any) : undefined,
        patientId: patientId || undefined,
      },
      include: {
        patient: { select: { id: true, name: true, mrn: true } },
        plan: { select: { id: true, type: true, version: true } },
        stage: { select: { id: true, name: true } },
        tasks: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const ex = await this.prisma.exceptionCase.findUnique({
      where: { id },
      include: {
        patient: true,
        plan: { include: { doctor: { select: { id: true, name: true } } } },
        stage: true,
        tasks: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ex) throw new NotFoundException('异常不存在');
    return ex;
  }

  /** 手工立案（如患者来电报告矫治器断裂、前台登记延期等） */
  @Post()
  @Roles('RECEPTION', 'NURSE', 'DOCTOR', 'FINANCE', 'LAB')
  async create(@Body() body: any, @CurrentUser() user: any) {
    if (!body.patientId || !body.type || !body.title) throw new BadRequestException('缺少必填字段');
    const patient = await this.prisma.patient.findUnique({
      where: { id: body.patientId },
      include: { plans: { where: { status: 'ACTIVE' }, include: { stages: { where: { status: 'ACTIVE' } } } } },
    });
    if (!patient) throw new NotFoundException('患者不存在');
    const plan = patient.plans[0];
    const type = body.type as ExceptionType;
    const ex = await this.svc.raise(
      {
        patientId: patient.id,
        planId: plan?.id,
        stageId: plan?.stages?.[0]?.id,
        type,
        title: body.title,
        detail: body.detail,
        impactDays: Number(body.impactDays) || 0,
        createdBy: user.sub,
        tasks: defaultTasksFor(type),
      },
      body.dedupe !== false,
    );
    return ex;
  }

  @Post(':id/tasks/:taskId/done')
  async doneTask(@Param('taskId') taskId: string, @CurrentUser() user: any) {
    const task = await this.prisma.exceptionTask.update({
      where: { id: taskId },
      data: { done: true, doneAt: new Date(), doneBy: user.sub },
      include: { exception: true },
    });
    // 有任务被处理 → 异常进入处理中
    if (task.exception.status === 'OPEN') {
      await this.prisma.exceptionCase.update({ where: { id: task.exceptionId }, data: { status: 'PROCESSING' } });
    }
    return task;
  }

  @Post(':id/resolve')
  @Roles('RECEPTION', 'NURSE', 'DOCTOR', 'FINANCE', 'LAB')
  async resolve(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    if (!body.resolution) throw new BadRequestException('请填写处理结论');
    return this.svc.resolve(id, body.resolution, body.impactDays != null ? Number(body.impactDays) : undefined, user.sub);
  }
}
