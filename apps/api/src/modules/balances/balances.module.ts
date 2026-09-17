import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GroupsModule } from '../groups/groups.module';
import { BalancesController } from './balances.controller';
import { BalancesService } from './balances.service';

@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [BalancesController],
  providers: [BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
