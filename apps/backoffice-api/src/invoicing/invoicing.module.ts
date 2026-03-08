import { Module } from '@nestjs/common';

import { InvoicingController } from './invoicing.controller.js';
import { InvoicingService } from './invoicing.service.js';

@Module({
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
