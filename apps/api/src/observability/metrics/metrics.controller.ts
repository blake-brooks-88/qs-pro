import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { register } from 'prom-client';

import { MetricsGuard } from './metrics.guard';

@Controller('metrics')
@UseGuards(MetricsGuard)
export class MetricsController {
  @Get()
  async getMetrics(@Res() res: FastifyReply) {
    res.header('Content-Type', register.contentType);
    res.send(await register.metrics());
  }
}
