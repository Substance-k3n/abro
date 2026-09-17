import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FriendsModule } from './modules/friends/friends.module';
import { GroupsModule } from './modules/groups/groups.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { BalancesModule } from './modules/balances/balances.module';
import { SettlementsModule } from './modules/settlements/settlements.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    GroupsModule,
    ExpensesModule,
    BalancesModule,
    SettlementsModule,
    // Remaining feature modules land here as they're built: AnalyticsModule,
    // NotificationsModule, RecurringModule — one per src/modules/*
    // directory, per docs/ABRO_PRD.md §32 and docs/DECISIONS.md (ADR-002).
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
