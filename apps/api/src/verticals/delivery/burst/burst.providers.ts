import { Provider } from '@nestjs/common';
import { BurstBufferService } from './burst-buffer.service';

/** S5.1: debounce de ráfagas (buffer en `Conversation.metadata.pendingBurst`). */
export const BURST_PROVIDERS: Provider[] = [BurstBufferService];
