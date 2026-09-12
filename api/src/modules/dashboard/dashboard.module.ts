import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [PaymentsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
