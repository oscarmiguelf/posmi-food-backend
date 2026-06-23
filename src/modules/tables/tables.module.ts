import { Module } from '@nestjs/common';
import { TablesController } from './infrastructure/http/tables.controller';

@Module({ controllers: [TablesController] })
export class TablesModule {}
