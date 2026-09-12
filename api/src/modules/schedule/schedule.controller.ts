import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/auth';
import { addDays, dayStart, parseDay } from '../../common/date.util';
import { PrismaService } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';
import { ScheduleService } from './schedule.service';

@Controller()
export class ScheduleController {
  constructor(
    private prisma: PrismaService,
    private svc: ScheduleService,
    private timeline: TimelineService,
  ) {}

  // ---------- 椅位 ----------
  @Get('chairs')
  chairs() {
    return this.prisma.chair.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('chairs')
  @Roles('ADMIN')
  addChair(@Body() body: any) {
    if (!body.name) throw new BadRequestException('椅位名称必填');
    return this.prisma.chair.create({ data: { name: body.name } });
  }

  // ---------- 医生排班 ----------
  @Get('schedules')
  schedules(@Query('doctorId') doctorId?: string) {
    return this.prisma.doctorSchedule.findMany({
      where: { doctorId: doctorId || undefined },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    });
  }

  @Post('schedules')
  @Roles('ADMIN', 'DOCTOR')
  addSchedule(@Body() body: any, @CurrentUser() user: any) {
    const doctorId = user.role === 'DOCTOR' ? user.sub : body.doctorId;
    if (!doctorId || body.weekday == null || body.startMin == null || body.endMin == null) {
      throw new BadRequestException('医生/星期/起止时间必填');
    }
    if (Number(body.startMin) >= Number(body.endMin)) throw new BadRequestException('结束时间需晚于开始时间');
    return this.prisma.doctorSchedule.create({
      data: { doctorId, weekday: Number(body.weekday), startMin: Number(body.startMin), endMin: Number(body.endMin) },
    });
  }

  @Delete('schedules/:id')
  @Roles('ADMIN', 'DOCTOR')
  delSchedule(@Param('id') id: string) {
    return this.prisma.doctorSchedule.delete({ where: { id } });
  }

  // ---------- 请假 ----------
  @Get('leaves')
  leaves() {
    return this.prisma.doctorLeave.findMany({
      include: { doctor: { select: { id: true, name: true } } },
      orderBy: { startDate: 'desc' },
      take: 50,
    });
  }

  @Post('leaves')
  @Roles('ADMIN', 'DOCTOR')
  createLeave(@Body() body: any, @CurrentUser() user: any) {
    const doctorId = user.role === 'DOCTOR' ? user.sub : body.doctorId;
    if (!doctorId || !body.startDate || !body.endDate) throw new BadRequestException('医生与起止日期必填');
    return this.svc.createLeave(doctorId, parseDay(body.startDate), parseDay(body.endDate), body.reason || '', user.sub);
  }

  @Post('leaves/:id/auto-reschedule')
  @Roles('RECEPTION', 'ADMIN')
  autoReschedule(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.autoRescheduleLeave(id, user.sub);
  }

  @Delete('leaves/:id')
  @Roles('ADMIN', 'DOCTOR')
  delLeave(@Param('id') id: string) {
    return this.prisma.doctorLeave.delete({ where: { id } });
  }

  // ---------- 预约 ----------
  @Get('appointments')
  async appointments(
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('doctorId') doctorId?: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
  ) {
    const gte = date ? parseDay(date) : from ? parseDay(from) : addDays(dayStart(new Date()), -7);
    const lte = date ? addDays(parseDay(date), 1) : to ? addDays(parseDay(to), 1) : addDays(gte, 14);
    return this.prisma.appointment.findMany({
      where: {
        startAt: { gte, lt: lte },
        doctorId: doctorId || undefined,
        patientId: patientId || undefined,
        status: status ? (status as any) : undefined,
      },
      include: {
        patient: { select: { id: true, name: true, mrn: true } },
        doctor: { select: { id: true, name: true } },
        chair: { select: { id: true, name: true } },
        plan: { select: { id: true, type: true, currentAligner: true, totalAligners: true } },
        visit: { select: { id: true, nurseAt: true, doctorAt: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 300,
    });
  }

  @Get('appointments/:id')
  async appointment(@Param('id') id: string) {
    const a = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: { select: { id: true, name: true } },
        chair: true,
        stage: true,
        plan: { include: { stages: { orderBy: { seq: 'asc' } } } },
        visit: { include: { materials: true, nurse: { select: { name: true } }, doctor: { select: { name: true } } } },
      },
    });
    if (!a) throw new NotFoundException('预约不存在');
    // 当前待收/逾期费用（护士核验付款阶段用）
    const duePayments = await this.prisma.paymentStage.findMany({
      where: { patientId: a.patientId, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { dueDate: 'asc' },
    });
    return { ...a, duePayments };
  }

  /** 智能槽位建议：按方案负责医生 + 出诊 + 椅位 + 患者时间偏好 */
  @Post('appointments/suggest')
  async suggest(@Body() body: any) {
    if (!body.patientId) throw new BadRequestException('请选择患者');
    const patient = await this.prisma.patient.findUnique({
      where: { id: body.patientId },
      include: { plans: { where: { status: 'ACTIVE' } } },
    });
    if (!patient) throw new NotFoundException('患者不存在');
    const plan = patient.plans[0];
    if (!plan) throw new BadRequestException('该患者没有在治方案');
    const slots = await this.svc.suggestSlots({
      doctorId: plan.doctorId,
      fromDate: body.fromDate ? parseDay(body.fromDate) : dayStart(new Date()),
      days: Math.min(Number(body.days) || 14, 42),
      durationMin: Number(body.durationMin) || 30,
      period: body.period,
      limit: Number(body.limit) || 12,
    });
    return { doctorId: plan.doctorId, slots };
  }

  @Post('appointments')
  @Roles('RECEPTION', 'NURSE', 'DOCTOR')
  book(@Body() body: any, @CurrentUser() user: any) {
    if (!body.patientId || !body.startAt) throw new BadRequestException('患者与开始时间必填');
    return this.svc.book({
      patientId: body.patientId,
      startAt: new Date(body.startAt),
      durationMin: Number(body.durationMin) || 30,
      type: body.type,
      note: body.note,
      actorId: user.sub,
    });
  }

  @Post('appointments/:id/arrive')
  @Roles('RECEPTION', 'NURSE')
  async arrive(@Param('id') id: string) {
    const a = await this.prisma.appointment.update({ where: { id }, data: { status: 'ARRIVED' } });
    return a;
  }

  @Post('appointments/:id/cancel')
  @Roles('RECEPTION', 'NURSE', 'DOCTOR')
  async cancel(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    const a = await this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: body.reason || '取消' },
    });
    await this.timeline.log(a.patientId, '预约', `预约取消：${body.reason || '取消'}`, { actorId: user.sub });
    return a;
  }

  @Post('appointments/:id/reschedule')
  @Roles('RECEPTION', 'NURSE', 'DOCTOR')
  reschedule(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.reschedule(
      id,
      body.startAt ? new Date(body.startAt) : null,
      body.reason || '',
      body.byPatient !== false,
      user.sub,
    );
  }
}
