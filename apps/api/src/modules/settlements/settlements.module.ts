import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GroupsModule } from '../groups/groups.module';
import { BalancesModule } from '../balances/balances.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

@Module({
  imports: [AuthModule, GroupsModule, BalancesModule, NotificationsModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
})
export class SettlementsModule {}
