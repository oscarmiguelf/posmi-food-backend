import { Module } from '@nestjs/common';
import { ConfigController } from './infrastructure/http/config.controller';

@Module({ controllers: [ConfigController] })
export class ConfigAppModule {}
