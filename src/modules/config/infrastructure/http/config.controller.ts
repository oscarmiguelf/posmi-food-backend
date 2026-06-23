import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WhiteLabelService } from '../../application/white-label.service';

@ApiTags('config')
@Controller('config')
export class ConfigController {
  constructor(private readonly whiteLabel: WhiteLabelService) {}

  /** Public — queried by the app on startup to resolve brand/theme/copies/modules. */
  @Get()
  getConfig() {
    return this.whiteLabel.getConfig();
  }
}
