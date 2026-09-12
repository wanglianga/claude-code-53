import { Module } from '@nestjs/common';
import { ScheduleModule } from '../schedule/schedule.module';
import { PaymentsModule } from '../payments/payments.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [ScheduleModule, PaymentsModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
