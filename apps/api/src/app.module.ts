import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    // Remaining feature modules land here as they're built: FriendsModule,
    // GroupsModule, ExpensesModule, BalancesModule, SettlementsModule,
    // AnalyticsModule, NotificationsModule, RecurringModule — one per
    // src/modules/* directory, per docs/ABRO_PRD.md §32 and docs/DECISIONS.md
    // (ADR-002).
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
