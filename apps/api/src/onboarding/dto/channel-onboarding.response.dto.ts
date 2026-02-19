/**
 * Response DTO for channel onboarding operations
 */
export interface ChannelOnboardingResponseDto {
  success: boolean;
  channelId?: string;
  message?: string;
  error?: string;
}

/**
 * Response for webhook subscription retry
 */
export interface WebhookSubscriptionResponseDto {
  success: boolean;
  message: string;
}
