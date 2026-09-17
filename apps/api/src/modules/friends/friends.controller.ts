import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type SearchFriendInput,
  type SendFriendRequestInput,
  searchFriendSchema,
  sendFriendRequestSchema,
} from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { toAuthProfile } from '../../common/mappers/to-auth-profile';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FriendsService } from './friends.service';

@Controller('friends')
@UseGuards(SessionGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get('search')
  async search(
    @CurrentUser() user: Profile,
    @Query(new ZodValidationPipe(searchFriendSchema)) query: SearchFriendInput,
  ) {
    const results = await this.friends.search(query.query, user.id);
    return results.map(toAuthProfile);
  }

  @Get()
  async list(@CurrentUser() user: Profile) {
    const rows = await this.friends.list(user.id);
    return rows.map((row) => ({
      friendshipId: row.friendshipId,
      since: row.since,
      friend: toAuthProfile(row.friend),
    }));
  }

  @Get('requests')
  async incomingRequests(@CurrentUser() user: Profile) {
    const rows = await this.friends.listIncomingRequests(user.id);
    return rows.map((row) => ({
      friendshipId: row.friendshipId,
      sentAt: row.sentAt,
      from: toAuthProfile(row.from),
    }));
  }

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  async sendRequest(
    @CurrentUser() user: Profile,
    @Body(new ZodValidationPipe(sendFriendRequestSchema)) body: SendFriendRequestInput,
  ) {
    const friendship = await this.friends.sendRequest(user.id, body.friendId);
    return { friendshipId: friendship.id, status: friendship.status };
  }

  @Post('requests/:id/accept')
  async acceptRequest(@CurrentUser() user: Profile, @Param('id') id: string) {
    const friendship = await this.friends.acceptRequest(user.id, id);
    return { friendshipId: friendship.id, status: friendship.status };
  }

  @Delete('requests/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async declineRequest(@CurrentUser() user: Profile, @Param('id') id: string) {
    await this.friends.declineRequest(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfriend(@CurrentUser() user: Profile, @Param('id') id: string) {
    await this.friends.unfriend(user.id, id);
  }
}
