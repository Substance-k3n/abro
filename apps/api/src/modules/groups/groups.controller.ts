import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type AddGroupMemberInput,
  type CreateGroupInput,
  type UpdateGroupInput,
  type UpdateGroupMemberRoleInput,
  addGroupMemberSchema,
  createGroupSchema,
  updateGroupMemberRoleSchema,
  updateGroupSchema,
} from '@abro/types';
import type { Profile } from '@prisma/client';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(SessionGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  create(
    @CurrentUser() user: Profile,
    @Body(new ZodValidationPipe(createGroupSchema)) body: CreateGroupInput,
  ) {
    return this.groups.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: Profile) {
    return this.groups.listMine(user.id);
  }

  @Get('invites')
  listInvites(@CurrentUser() user: Profile) {
    return this.groups.listMyInvites(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: Profile, @Param('id') id: string) {
    return this.groups.findById(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: Profile,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGroupSchema)) body: UpdateGroupInput,
  ) {
    return this.groups.update(user.id, id, body);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() user: Profile,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addGroupMemberSchema)) body: AddGroupMemberInput,
  ) {
    return this.groups.addMember(user.id, id, body.userId);
  }

  @Post(':id/invite/accept')
  acceptInvite(@CurrentUser() user: Profile, @Param('id') id: string) {
    return this.groups.acceptInvite(user.id, id);
  }

  @Patch(':id/members/:userId')
  updateMemberRole(
    @CurrentUser() user: Profile,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body(new ZodValidationPipe(updateGroupMemberRoleSchema)) body: UpdateGroupMemberRoleInput,
  ) {
    return this.groups.updateMemberRole(user.id, id, targetUserId, body.role);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @CurrentUser() user: Profile,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.groups.removeMember(user.id, id, targetUserId);
  }
}
