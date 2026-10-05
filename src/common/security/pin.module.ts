import { Module } from '@nestjs/common';
import { PinService } from './pin.service.js';
import { PinVaultService } from './pin-vault.service.js';

@Module({
  providers: [PinService, PinVaultService],
  exports: [PinService, PinVaultService],
})
export class PinModule {}
