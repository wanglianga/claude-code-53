import { Body, Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { CurrentUser, Public } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { username: body.username } });
    if (!user || !user.active || !bcrypt.compareSync(body.password || '', user.password)) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload = { sub: user.id, username: user.username, role: user.role, name: user.name };
    return { token: await this.jwt.signAsync(payload), user: payload };
  }

  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }
}
