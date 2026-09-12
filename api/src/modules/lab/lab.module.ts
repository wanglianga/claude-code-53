import { Module } from '@nestjs/common';
import { LabController } from './lab.controller';

@Module({ controllers: [LabController] })
export class LabModule {}
