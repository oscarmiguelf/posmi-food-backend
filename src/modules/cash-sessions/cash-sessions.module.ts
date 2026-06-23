import { Module } from '@nestjs/common';
import { CashSessionsController } from './infrastructure/http/cash-sessions.controller';

@Module({ controllers: [CashSessionsController] })
export class CashSessionsModule {}
