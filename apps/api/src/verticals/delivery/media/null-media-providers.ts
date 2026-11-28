import type { ImageInterpreter, Transcriber } from '../contracts';

/**
 * S5.0-T3: stubs de Transcriber/ImageInterpreter hasta que entren S5.2 (voz) y S5.3 (imagen).
 * Siempre devuelven UNSUPPORTED → MediaRouter cae al fallback "escríbelo".
 */
export const NULL_TRANSCRIBER: Transcriber = {
  transcribe: async () => ({ ok: false, reason: 'UNSUPPORTED' }),
};

export const NULL_IMAGE_INTERPRETER: ImageInterpreter = {
  interpret: async () => ({ ok: false, reason: 'UNSUPPORTED' }),
};
