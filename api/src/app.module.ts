import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard, RolesGuard } from './common/auth';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExceptionsModule } from './modules/exceptions/exceptions.module';
import { ImagingModule } from './modules/imaging/imaging.module';
import { LabModule } from './modules/lab/lab.module';
import { PatientsModule } from './modules/patients/patients.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlansModule } from './modules/plans/plans.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { UsersModule } from './modules/users/users.module';
import { VisitsModule } from './modules/visits/visits.module';

@Module({
  imports: [
    CommonModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    PlansModule,
    ScheduleModule,
    VisitsModule,
    ExceptionsModule,
    PaymentsModule,
    LabModule,
    ImagingModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
