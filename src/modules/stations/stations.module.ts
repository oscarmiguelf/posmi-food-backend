import { Module } from '@nestjs/common';
import { StationsController } from './infrastructure/http/stations.controller';

@Module({ controllers: [StationsController] })
export class StationsModule {}
