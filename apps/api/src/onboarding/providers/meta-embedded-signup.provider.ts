import { Injectable, Logger } from '@nestjs/common';
import { MetaTokenResponse, MetaWabaInfo } from '../dto/waba-info.dto';

interface MetaDebugTokenScope {
  scope: string;
  target_ids?: string[];
}

interface MetaDebugTokenData {
  data?: {
    granular_scopes?: MetaDebugTokenScope[];
  };
}

/**
 * Provider for Meta Embedded Signup OAuth flow
 * Handles OAuth URL generation, token exchange, WABA info fetch, and webhook subscription
 *
 * REQ-03: MetaEmbeddedSignupProvider with OAuth helpers
 * AC-02, AC-03: OAuth URL generation and token exchange
 */
@Injectable()
export class MetaEmbeddedSignupProvider {
  private readonly logger = new Logger(MetaEmbeddedSignupProvider.name);
  private readonly metaApiUrl: string;
  private readonly metaApiVersion: string;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly configId: string,
  ) {
    this.metaApiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com';
    this.metaApiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';
  }

  /**
   * Generate Meta OAuth authorization URL
   * AC-02: should generate auth URL with state
   */
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: redirectUri,
      config_id: this.configId,
      state: state,
      response_type: 'code',
      scope: 'whatsapp_business_management,whatsapp_business_messaging',
    });

    const authUrl = `https://www.facebook.com/${this.metaApiVersion}/dialog/oauth?${params.toString()}`;
    this.logger.log(`Generated OAuth URL with state: ${state.substring(0, 8)}...`);
    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   * AC-03: should exchange code for access_token
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<MetaTokenResponse> {
    const url = `${this.metaApiUrl}/${this.metaApiVersion}/oauth/access_token`;
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: redirectUri,
      code: code,
    });

    this.logger.log(`Exchanging code for token...`);

    try {
      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Token exchange failed: ${response.status} - ${errorBody}`);
        throw new Error(`Meta API token exchange failed: ${response.status}`);
      }

      const data = await response.json();
      this.logger.log(`Token exchange successful`);
      return data as MetaTokenResponse;
    } catch (error) {
      this.logger.error(`Token exchange error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch WABA info from Meta Graph API
   * If wabaId is provided, fetch that specific WABA
   * Otherwise, use debug_token to get WABA from token
   */
  async fetchWabaInfo(accessToken: string, wabaId?: string): Promise<MetaWabaInfo> {
    this.logger.log(`Fetching WABA info...`);

    try {
      // If WABA ID not provided, fetch from debug_token
      let targetWabaId = wabaId;
      if (!targetWabaId) {
        const debugUrl = `${this.metaApiUrl}/${this.metaApiVersion}/debug_token`;
        const debugParams = new URLSearchParams({
          input_token: accessToken,
          access_token: `${this.appId}|${this.appSecret}`,
        });

        const debugResponse = await fetch(`${debugUrl}?${debugParams.toString()}`);
        if (!debugResponse.ok) {
          throw new Error(`Debug token failed: ${debugResponse.status}`);
        }

        const debugData: MetaDebugTokenData = await debugResponse.json();
        targetWabaId = debugData.data?.granular_scopes?.find(
          (scope) => scope.scope === 'whatsapp_business_management',
        )?.target_ids?.[0];

        if (!targetWabaId) {
          throw new Error('WABA ID not found in token scopes');
        }
      }

      // Fetch WABA details + phone numbers
      const wabaUrl = `${this.metaApiUrl}/${this.metaApiVersion}/${targetWabaId}`;
      const wabaParams = new URLSearchParams({
        fields: 'id,name,phone_numbers{id,display_phone_number,verified_name}',
        access_token: accessToken,
      });

      const wabaResponse = await fetch(`${wabaUrl}?${wabaParams.toString()}`);
      if (!wabaResponse.ok) {
        const errorBody = await wabaResponse.text();
        this.logger.error(`WABA fetch failed: ${wabaResponse.status} - ${errorBody}`);
        throw new Error(`WABA fetch failed: ${wabaResponse.status}`);
      }

      const wabaData = await wabaResponse.json();
      this.logger.log(`WABA info fetched successfully: ${wabaData.id}`);

      return {
        id: wabaData.id,
        name: wabaData.name,
        phone_numbers: wabaData.phone_numbers?.data || [],
      } as MetaWabaInfo;
    } catch (error) {
      this.logger.error(`WABA fetch error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Subscribe webhook for WABA
   * AC-09: Webhook subscription should update webhookSubscribed=true on success
   */
  async subscribeWebhook(
    wabaId: string,
    accessToken: string,
    callbackUrl: string,
    verifyToken: string,
  ): Promise<{ success: boolean; error?: string }> {
    const url = `${this.metaApiUrl}/${this.metaApiVersion}/${wabaId}/subscribed_apps`;

    this.logger.log(`Subscribing webhook for WABA: ${wabaId}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: accessToken,
          override_callback_url: callbackUrl,
          verify_token: verifyToken,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.warn(`Webhook subscription failed: ${response.status} - ${errorBody}`);
        return {
          success: false,
          error: `Meta API error: ${response.status}`,
        };
      }

      const data = await response.json();
      this.logger.log(`Webhook subscription successful for WABA: ${wabaId}`);
      return { success: data.success === true };
    } catch (error) {
      this.logger.error(`Webhook subscription error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
