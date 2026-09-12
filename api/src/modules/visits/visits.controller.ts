import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { VisitsService } from './visits.service';

@Controller()
export class VisitsController {
  constructor(
    private svc: VisitsService,
    private prisma: PrismaService,
  ) {}

  @Post('appointments/:id/nurse-check')
  @Roles('NURSE')
  nurseCheck(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.nurseCheck(id, body, user);
  }

  @Post('appointments/:id/doctor-conclusion')
  @Roles('DOCTOR')
  doctorConclusion(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.doctorConclusion(id, body, user);
  }

  @Get('visits/:id')
  async visit(@Param('id') id: string) {
    const v = await this.prisma.visitRecord.findUnique({
      where: { id },
      include: {
        materials: true,
        nurse: { select: { name: true } },
        doctor: { select: { name: true } },
        stage: true,
        appointment: { include: { patient: true } },
      },
    });
    if (!v) throw new NotFoundException('复诊记录不存在');
    return v;
  }
}
