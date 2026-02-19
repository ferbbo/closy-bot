/**
 * DTO for Meta WhatsApp Business Account information
 * Used to parse and validate WABA data from Meta Graph API
 */
export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
}

export interface MetaPhoneNumber {
  id: string; // Phone Number ID
  display_phone_number: string; // +57...
  verified_name: string;
}

export interface MetaWabaInfo {
  id: string; // WABA ID
  name: string;
  phone_numbers?: MetaPhoneNumber[];
}

/**
 * Internal representation of WABA info for channel creation
 */
export interface WabaInfoDto {
  wabaId: string;
  wabaName: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  accessToken: string;
}
