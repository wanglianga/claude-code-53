import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Roles } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';

const SAFE = { id: true, username: true, name: true, role: true, active: true, createdAt: true };

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('ADMIN')
  list() {
    return this.prisma.user.findMany({ select: SAFE, orderBy: { createdAt: 'asc' } });
  }

  /** 医生列表（建档/排班下拉用，登录即可读） */
  @Get('doctors')
  doctors() {
    return this.prisma.user.findMany({
      where: { role: 'DOCTOR', active: true },
      select: SAFE,
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: any) {
    if (!body.username || !body.password || !body.name || !body.role) {
      throw new BadRequestException('用户名/密码/姓名/角色均为必填');
    }
    return this.prisma.user.create({
      data: {
        username: body.username,
        password: bcrypt.hashSync(body.password, 10),
        name: body.name,
        role: body.role,
      },
      select: SAFE,
    });
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() body: any) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return this.prisma.user.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        role: body.role ?? undefined,
        active: body.active ?? undefined,
        password: body.password ? bcrypt.hashSync(body.password, 10) : undefined,
      },
      select: SAFE,
    });
  }
}
