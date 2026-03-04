/**
 * Auth Me Response DTO
 * Response for /auth/me endpoint
 */
export class AuthMeResponseDto {
  authenticated!: boolean;

  merchant!: {
    id: string;
    name: string;
    email: string;
    status: string;
  };
}
