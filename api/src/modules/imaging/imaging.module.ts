import { Module } from '@nestjs/common';
import { ImagingController } from './imaging.controller';

@Module({ controllers: [ImagingController] })
export class ImagingModule {}
