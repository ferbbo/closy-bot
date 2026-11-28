import { Provider } from '@nestjs/common';
import { MEDIA_FETCHER, TRANSCRIBER, IMAGE_INTERPRETER } from '../contracts';
import { GraphMediaFetcher } from './media-fetcher.service';
import { MediaRouter } from './media-router.service';
import { NULL_IMAGE_INTERPRETER } from './null-media-providers';
import { GroqWhisperTranscriber } from './transcriber.groq';

/**
 * S5.0: MediaFetcher real (Graph API) + stubs de Transcriber/ImageInterpreter.
 * S5.2 y S5.3 reemplazan los stubs por sus propios providers (mismos tokens).
 */
export const MEDIA_PROVIDERS: Provider[] = [
  GraphMediaFetcher,
  { provide: MEDIA_FETCHER, useExisting: GraphMediaFetcher },
  { provide: TRANSCRIBER, useClass: GroqWhisperTranscriber },
  { provide: IMAGE_INTERPRETER, useValue: NULL_IMAGE_INTERPRETER },
  MediaRouter,
];
