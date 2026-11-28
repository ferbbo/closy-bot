/**
 * Tipos compartidos del router de verticales.
 *
 * Fuente única: los contratos congelados de la vertical delivery (CONTRACTS.md §1,
 * "Router vertical"). Se re-exportan aquí para que el orquestador no dependa de
 * una vertical concreta.
 */
export type { VerticalContext, VerticalResult, VerticalHandler } from './delivery/contracts';
