import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { Profile } from '@prisma/client';

import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { GroupsService } from '../groups/groups.service';
import { BalancesService } from './balances.service';

@Controller('balances')
@UseGuards(SessionGuard)
export class BalancesController {
  constructor(
    private readonly balances: BalancesService,
    private readonly groups: GroupsService,
  ) {}

  @Get('friends/:friendId')
  async friendBalance(@CurrentUser() user: Profile, @Param('friendId') friendId: string) {
    const balance = await this.balances.getPairwiseBalance(user.id, friendId);
    return { friendId, netBalance: balance };
  }

  @Get('groups/:groupId')
  async groupSummary(@CurrentUser() user: Profile, @Param('groupId') groupId: string) {
    await this.groups.requireActiveMembership(groupId, user.id);
    return this.balances.getGroupSummary(groupId);
  }

  @Get('groups/:groupId/simplified')
  async simplifiedGroupDebts(@CurrentUser() user: Profile, @Param('groupId') groupId: string) {
    await this.groups.requireActiveMembership(groupId, user.id);
    return this.balances.getSimplifiedGroupDebts(groupId);
  }
}
