import { Provider } from '@nestjs/common';
import { BurstBufferService } from './burst-buffer.service';
import { BurstSweeperService } from './burst-sweeper.service';

/** S5.1: debounce de ráfagas (buffer en `Conversation.metadata.pendingBurst`) + barrido. */
export const BURST_PROVIDERS: Provider[] = [BurstBufferService, BurstSweeperService];
