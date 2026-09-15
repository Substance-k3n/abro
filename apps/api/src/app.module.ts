import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Feature modules land here as they're built:
    // AuthModule, UsersModule, FriendsModule, GroupsModule, ExpensesModule,
    // BalancesModule, SettlementsModule, AnalyticsModule, NotificationsModule,
    // RecurringModule — one per src/modules/* directory, per
    // docs/ABRO_PRD.md §32 and docs/DECISIONS.md (ADR-002).
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
