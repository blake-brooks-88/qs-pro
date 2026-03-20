import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import { z } from 'zod';

import { CsrfGuard } from '../auth/csrf.guard';
import {
  CurrentUser,
  type UserSession,
} from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RelationshipsService } from './relationships.service';

const SaveRuleSchema = z.object({
  ruleType: z.enum(['alias_group', 'explicit_link', 'exclusion']),
  sourceDE: z.string().min(1),
  sourceColumn: z.string().min(1),
  targetDE: z.string().min(1),
  targetColumn: z.string().min(1),
});

const DismissSchema = z.object({
  sourceDE: z.string().min(1),
  sourceColumn: z.string().min(1),
  targetDE: z.string().min(1),
  targetColumn: z.string().min(1),
});

type SaveRuleDto = z.infer<typeof SaveRuleSchema>;
type DismissDto = z.infer<typeof DismissSchema>;

@Controller('relationships')
@UseGuards(SessionGuard)
export class RelationshipsController {
  constructor(private readonly relationshipsService: RelationshipsService) {}

  @Get('graph')
  async getGraph(@CurrentUser() user: UserSession) {
    return this.relationshipsService.getGraph(
      user.tenantId,
      user.userId,
      user.mid,
    );
  }

  @Post('rules')
  @UseGuards(CsrfGuard)
  async saveRule(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(SaveRuleSchema)) dto: SaveRuleDto,
  ) {
    return this.relationshipsService.saveRule(
      user.tenantId,
      user.userId,
      user.mid,
      dto,
    );
  }

  @Delete('rules/:ruleId')
  @UseGuards(CsrfGuard)
  async deleteRule(
    @CurrentUser() user: UserSession,
    @Param('ruleId', new ParseUUIDPipe({ version: '4' })) ruleId: string,
  ) {
    await this.relationshipsService.deleteRule(
      user.tenantId,
      user.userId,
      user.mid,
      ruleId,
    );
    return { success: true };
  }

  @Post('dismiss')
  @UseGuards(CsrfGuard)
  async dismiss(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(DismissSchema)) dto: DismissDto,
  ) {
    return this.relationshipsService.dismissRelationship(
      user.tenantId,
      user.userId,
      user.mid,
      dto,
    );
  }
}
