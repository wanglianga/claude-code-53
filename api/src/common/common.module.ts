import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TimelineService } from './timeline.service';

@Global()
@Module({
  providers: [PrismaService, TimelineService],
  exports: [PrismaService, TimelineService],
})
export class CommonModule {}
