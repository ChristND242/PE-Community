import { Controller, Get } from '@nestjs/common';
import { currentSystemVersion } from './system-version';

@Controller('system')
export class SystemVersionController {
  @Get('version')
  version() {
    return currentSystemVersion();
  }
}
