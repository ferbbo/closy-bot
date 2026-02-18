import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session/session.service';
import { PostgresSessionStore } from './session/postgres-session.store';
import { GoogleOidcProvider } from './providers/google-oidc.provider';
import { MicrosoftOidcProvider } from './providers/microsoft-oidc.provider';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { SessionCleanupScheduler } from './schedulers/session-cleanup.scheduler';

@Module({
  imports: [ConfigModule, HttpModule, ScheduleModule.forRoot(), PersistenceModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    {
      provide: 'SessionStore',
      useClass: PostgresSessionStore,
    },
    PostgresSessionStore,
    GoogleOidcProvider,
    MicrosoftOidcProvider,
    SessionAuthGuard,
    SessionCleanupScheduler,
  ],
  exports: [SessionService, SessionAuthGuard],
})
export class AuthModule {}
