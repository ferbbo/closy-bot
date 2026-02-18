/**
 * OIDC Provider Interface
 * Abstraction for OpenID Connect Authorization Code Flow
 */

export interface OidcTokens {
  idToken: string;
  accessToken?: string;
}

export interface OidcUserInfo {
  sub: string; // OIDC subject (unique ID from provider)
  email: string;
  name?: string;
}

export interface OidcProvider {
  /**
   * Generate authorization URL for OAuth 2.0 Authorization Code Flow
   * @param state CSRF protection token
   * @param redirectUri Callback URL
   */
  getAuthorizationUrl(state: string, redirectUri: string): string;

  /**
   * Exchange authorization code for tokens
   * @param code Authorization code from callback
   * @param redirectUri Same redirect URI used in authorization
   */
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<OidcTokens>;

  /**
   * Extract user info from ID token
   * @param idToken JWT ID token from provider
   */
  getUserInfo(idToken: string): Promise<OidcUserInfo>;
}
