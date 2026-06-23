import { SetMetadata } from '@nestjs/common';
import { REQUIRE_MODULE_KEY } from '../guards/module-enabled.guard';
import { ModulesConfig } from '../domain/schemas/modules.schema';

export const RequireModule = (module: keyof ModulesConfig['modules']) =>
  SetMetadata(REQUIRE_MODULE_KEY, module);
