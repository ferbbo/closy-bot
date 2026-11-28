import { Provider } from '@nestjs/common';
import { MEDIA_FETCHER, TRANSCRIBER, IMAGE_INTERPRETER } from '../contracts';
import { GraphMediaFetcher } from './media-fetcher.service';
import { MediaRouter } from './media-router.service';
import { GroqVisionInterpreter } from './image-interpreter.groq';
import { NULL_TRANSCRIBER } from './null-media-providers';

/**
 * S5.0: MediaFetcher real (Graph API) + stubs de Transcriber/ImageInterpreter.
 * S5.2 y S5.3 reemplazan los stubs por sus propios providers (mismos tokens).
 */
export const MEDIA_PROVIDERS: Provider[] = [
  GraphMediaFetcher,
  { provide: MEDIA_FETCHER, useExisting: GraphMediaFetcher },
  { provide: TRANSCRIBER, useValue: NULL_TRANSCRIBER },
  { provide: IMAGE_INTERPRETER, useClass: GroqVisionInterpreter }, // S5.3-T1
  MediaRouter,
];
