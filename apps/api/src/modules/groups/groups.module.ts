import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [AuthModule, FriendsModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
