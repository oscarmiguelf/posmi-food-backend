import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WhiteLabelService } from '../application/white-label.service';
import { ModulesConfig } from '../domain/schemas/modules.schema';

export const REQUIRE_MODULE_KEY = 'requireModule';

@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly whiteLabel: WhiteLabelService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const module = this.reflector.getAllAndOverride<
      keyof ModulesConfig['modules'] | undefined
    >(REQUIRE_MODULE_KEY, [context.getHandler(), context.getClass()]);

    if (!module) return true;

    if (!this.whiteLabel.isModuleEnabled(module)) {
      throw new ForbiddenException({
        code: 'MODULE_NOT_ENABLED',
        message: `The module "${module}" is not enabled for this instance`,
      });
    }

    return true;
  }
}
