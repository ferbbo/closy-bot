import { Provider } from '@nestjs/common';
import { MEDIA_FETCHER, TRANSCRIBER, IMAGE_INTERPRETER } from '../contracts';
import { GraphMediaFetcher } from './media-fetcher.service';
import { MediaRouter } from './media-router.service';
import { GroqVisionInterpreter } from './image-interpreter.groq';
import { ProductPhotoResolver } from './product-photo.service';
import { ReceiptForwarder } from './receipt.service';
import { GroqWhisperTranscriber } from './transcriber.groq';

/**
 * Multimodal: MediaFetcher real (Graph API, S5.0) + Transcriber (S5.2) + ImageInterpreter (S5.3).
 * Los e2e sobrescriben los tokens con los fakes de test/utils/fake-media.ts.
 */
export const MEDIA_PROVIDERS: Provider[] = [
  GraphMediaFetcher,
  { provide: MEDIA_FETCHER, useExisting: GraphMediaFetcher },
  { provide: TRANSCRIBER, useClass: GroqWhisperTranscriber }, // S5.2-T1
  { provide: IMAGE_INTERPRETER, useClass: GroqVisionInterpreter }, // S5.3-T1
  ProductPhotoResolver, // S5.3-T2
  ReceiptForwarder, // S5.3-T3
  MediaRouter,
];
