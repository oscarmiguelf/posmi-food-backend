import { Module } from '@nestjs/common';
import { ConfigController } from './infrastructure/http/config.controller';
import { WhiteLabelService } from './application/white-label.service';
import { ModuleEnabledGuard } from './guards/module-enabled.guard';

@Module({
  controllers: [ConfigController],
  providers: [WhiteLabelService, ModuleEnabledGuard],
  exports: [WhiteLabelService, ModuleEnabledGuard],
})
export class ConfigAppModule {}
