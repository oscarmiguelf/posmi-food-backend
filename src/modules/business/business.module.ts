import { Module } from '@nestjs/common';
import { BusinessController } from './infrastructure/http/business.controller';

@Module({ controllers: [BusinessController] })
export class BusinessModule {}
