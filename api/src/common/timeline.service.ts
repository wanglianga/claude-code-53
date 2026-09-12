import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// 时间轴：所有关键事件回到患者长期档案，可锚定到治疗阶段
@Injectable()
export class TimelineService {
  constructor(private prisma: PrismaService) {}

  async log(
    patientId: string,
    kind: string,
    title: string,
    opts?: { stageId?: string; detail?: string; actorId?: string },
  ) {
    await this.prisma.timelineEvent.create({
      data: {
        patientId,
        kind,
        title,
        stageId: opts?.stageId || null,
        detail: opts?.detail || null,
        actorId: opts?.actorId || null,
      },
    });
  }
}
