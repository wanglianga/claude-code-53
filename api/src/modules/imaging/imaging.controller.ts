import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { CurrentUser, Public, Roles } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { TimelineService } from '../../common/timeline.service';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

@Controller()
export class ImagingController {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
  ) {}

  /** 影像上传（口扫/面像/X 光等），自动锚定当前治疗阶段并递增版本号 */
  @Post('imaging')
  @Roles('NURSE', 'DOCTOR', 'RECEPTION')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname || '').toLowerCase()),
      }),
      limits: { fileSize: 30 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFile() file: any, @Body() body: any, @CurrentUser() user: any) {
    if (!body.patientId || !body.type) throw new BadRequestException('患者与影像类型必填');
    const patient = await this.prisma.patient.findUnique({
      where: { id: body.patientId },
      include: { plans: { where: { status: 'ACTIVE' }, include: { stages: { where: { status: 'ACTIVE' } } } } },
    });
    if (!patient) throw new NotFoundException('患者不存在');
    const plan = patient.plans[0];
    const stageId = body.stageId || plan?.stages[0]?.id || null;
    const sameType = await this.prisma.imagingRecord.count({
      where: { patientId: patient.id, type: body.type },
    });
    const rec = await this.prisma.imagingRecord.create({
      data: {
        patientId: patient.id,
        planId: plan?.id || null,
        stageId,
        type: body.type,
        version: sameType + 1,
        filePath: file ? path.basename(file.path) : null,
        note: body.note || null,
        takenAt: body.takenAt ? new Date(body.takenAt) : new Date(),
        uploadedBy: user.sub,
      },
    });
    await this.timeline.log(patient.id, '影像', `影像归档：${body.type} v${rec.version}`, {
      stageId: stageId || undefined,
      detail: body.note,
      actorId: user.sub,
    });
    return rec;
  }

  @Get('imaging')
  list(@Query('patientId') patientId: string) {
    return this.prisma.imagingRecord.findMany({
      where: { patientId: patientId || undefined },
      include: { stage: { select: { id: true, name: true } } },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
      take: 200,
    });
  }

  /** 影像文件访问（演示环境放开，生产应加鉴权） */
  @Public()
  @Get('files/:name')
  file(@Param('name') name: string, @Res() res: Response) {
    const safe = path.basename(name);
    const p = path.join(UPLOAD_DIR, safe);
    if (!fs.existsSync(p)) throw new NotFoundException('文件不存在');
    res.sendFile(path.resolve(p));
  }
}
