/**
 * Channel Health DTO
 * Provides health status and diagnostics for a channel
 * REQ-03: AC-04
 */
export interface ChannelHealthDto {
  channelId: string;
  status: 'connected' | 'pending' | 'error';
  webhookSubscribed: boolean;
  lastWebhookAt: string | null; // ISO timestamp
  recentErrors: string[]; // últimos 3 errores
  errorCount: number;
  lastErrorAt: string | null; // ISO timestamp
  recommendation: 'resubscribe_webhook' | 'refresh_credentials' | 'check_permissions' | null;
}

/**
 * Retry Webhook Response DTO
 * REQ-05: AC-08
 */
export interface RetryWebhookResponseDto {
  success: boolean;
  message: string;
}

/**
 * Refresh Status Response DTO
 * REQ-07: AC-11
 */
export interface RefreshStatusResponseDto {
  success: boolean;
  status: string;
}
