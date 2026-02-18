/**
 * OIDC ID Token Claims
 * Standard claims from decoded ID token JWT
 */
export interface IdTokenClaims {
  sub: string; // Subject (unique user ID)
  email: string;
  name?: string;
  preferred_username?: string; // Microsoft uses this
  aud: string; // Audience
  iss: string; // Issuer
  exp: number; // Expiry timestamp
  iat: number; // Issued at timestamp
  [key: string]: unknown; // Allow additional claims
}
