import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';
import { currentStage, delayInfo } from '../../common/plan.util';

@Controller('patients')
export class PatientsController {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
  ) {}

  @Get()
  async list(@Query('q') q?: string) {
    const patients = await this.prisma.patient.findMany({
      where: q
        ? { OR: [{ name: { contains: q } }, { mrn: { contains: q } }, { phone: { contains: q } }] }
        : undefined,
      include: {
        primaryDoctor: { select: { id: true, name: true } },
        plans: {
          where: { status: 'ACTIVE' },
          include: { doctor: { select: { id: true, name: true } }, stages: true },
        },
        appointments: {
          where: { status: { in: ['SCHEDULED', 'ARRIVED', 'NURSE_DONE'] }, startAt: { gte: new Date(Date.now() - 86400000) } },
          orderBy: { startAt: 'asc' },
          take: 1,
        },
        exceptions: { where: { status: { not: 'RESOLVED' } }, select: { id: true, type: true, impactDays: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return patients.map((p) => ({
      ...p,
      activePlan: p.plans[0] || null,
      nextAppointment: p.appointments[0] || null,
      openExceptions: p.exceptions.length,
      plans: undefined,
      appointments: undefined,
    }));
  }

  @Post()
  @Roles('RECEPTION', 'NURSE', 'DOCTOR')
  async create(@Body() body: any, @CurrentUser() user: any) {
    if (!body.name || !body.gender) throw new BadRequestException('姓名与性别必填');
    // 病历号：P + 年月 + 3 位序号
    const now = new Date();
    const prefix = `P${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.prisma.patient.count({ where: { mrn: { startsWith: prefix } } });
    const mrn = `${prefix}${String(count + 1).padStart(3, '0')}`;
    const patient = await this.prisma.patient.create({
      data: {
        mrn,
        name: body.name,
        gender: body.gender,
        birthDate: body.birthDate ? new Date(body.birthDate) : null,
        phone: body.phone || null,
        address: body.address || null,
        allergy: body.allergy || null,
        perioStatus: body.perioStatus || null, // 牙周情况
        note: body.note || null,
        primaryDoctorId: body.primaryDoctorId || null,
      },
    });
    await this.timeline.log(patient.id, '建档', '患者建档，记录牙周情况等基础信息', { actorId: user.sub });
    return patient;
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const p = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        primaryDoctor: { select: { id: true, name: true } },
        plans: {
          orderBy: { version: 'asc' },
          include: {
            doctor: { select: { id: true, name: true } },
            stages: { orderBy: { seq: 'asc' } },
            payments: { orderBy: { seq: 'asc' } },
          },
        },
        appointments: {
          orderBy: { startAt: 'desc' },
          take: 30,
          include: {
            doctor: { select: { id: true, name: true } },
            chair: { select: { id: true, name: true } },
            stage: { select: { id: true, name: true } },
            visit: { select: { id: true, nurseAt: true, doctorAt: true } },
          },
        },
        imaging: { orderBy: [{ type: 'asc' }, { version: 'desc' }], include: { stage: { select: { id: true, name: true } } } },
        exceptions: { orderBy: { createdAt: 'desc' }, include: { tasks: true, stage: { select: { id: true, name: true } } } },
        labOrders: { orderBy: { requestedAt: 'desc' }, include: { stage: { select: { id: true, name: true } } } },
        timeline: { orderBy: { createdAt: 'desc' }, take: 80, include: { actor: { select: { name: true } }, stage: { select: { id: true, name: true } } } },
        visits: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: {
            nurse: { select: { name: true } },
            doctor: { select: { name: true } },
            stage: { select: { id: true, name: true } },
            materials: true,
            appointment: { select: { startAt: true, type: true } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException('患者不存在');
    const activePlan = p.plans.find((pl) => pl.status === 'ACTIVE') || null;
    const stage = activePlan ? currentStage(activePlan as any) : null;
    const delay = activePlan ? delayInfo(activePlan, p.exceptions) : null;
    return { ...p, activePlan, currentStage: stage, delay };
  }

  @Patch(':id')
  @Roles('RECEPTION', 'NURSE', 'DOCTOR')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        gender: body.gender ?? undefined,
        birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
        phone: body.phone ?? undefined,
        address: body.address ?? undefined,
        allergy: body.allergy ?? undefined,
        perioStatus: body.perioStatus ?? undefined,
        note: body.note ?? undefined,
      },
    });
    await this.timeline.log(id, '建档', '更新患者基础档案', { actorId: user.sub });
    return patient;
  }
}
