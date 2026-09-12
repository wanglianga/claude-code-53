import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Public } from '../../common/auth';
import { addDays, dayStart } from '../../common/date.util';
import { PrismaService } from '../../common/prisma.service';
import { PaymentsService } from '../payments/payments.service';

@Controller()
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
  ) {}

  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, ts: new Date().toISOString() };
  }

  @Get('dashboard')
  async dashboard(@CurrentUser() user: any) {
    await this.payments.sweepOverdue();
    const todayStart = dayStart(new Date());
    const todayEnd = addDays(todayStart, 1);
    const doctorFilter = user.role === 'DOCTOR' ? { doctorId: user.sub } : {};

    const [
      todayAppointments,
      pendingNurse,
      pendingDoctor,
      openExceptions,
      myTasks,
      overduePayments,
      labInTransit,
      recentTimeline,
      patientCount,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { startAt: { gte: todayStart, lt: todayEnd }, ...doctorFilter },
        include: {
          patient: { select: { id: true, name: true, mrn: true } },
          doctor: { select: { name: true } },
          chair: { select: { name: true } },
          plan: { select: { type: true, currentAligner: true, totalAligners: true } },
          visit: { select: { id: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.appointment.count({ where: { status: 'ARRIVED', ...doctorFilter } }),
      this.prisma.appointment.count({ where: { status: 'NURSE_DONE', ...doctorFilter } }),
      this.prisma.exceptionCase.findMany({
        where: { status: { not: 'RESOLVED' } },
        include: { patient: { select: { id: true, name: true } }, tasks: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.exceptionTask.findMany({
        where: { done: false, assigneeRole: user.role, exception: { status: { not: 'RESOLVED' } } },
        include: { exception: { include: { patient: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.paymentStage.findMany({
        where: { status: 'OVERDUE' },
        include: { patient: { select: { id: true, name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
      this.prisma.labOrder.findMany({
        where: { status: { in: ['REQUESTED', 'IN_PRODUCTION', 'SHIPPED'] } },
        include: { patient: { select: { id: true, name: true } } },
        orderBy: { requestedAt: 'desc' },
        take: 20,
      }),
      this.prisma.timelineEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { patient: { select: { id: true, name: true } }, actor: { select: { name: true } } },
      }),
      this.prisma.patient.count(),
    ]);

    return {
      todayAppointments,
      pendingNurse,
      pendingDoctor,
      openExceptions,
      myTasks,
      overduePayments,
      labInTransit,
      recentTimeline,
      patientCount,
    };
  }
}
