import { Module } from '@nestjs/common';
import { ReportsController } from './infrastructure/http/reports.controller';

@Module({
  controllers: [ReportsController],
})
export class ReportsModule {}
