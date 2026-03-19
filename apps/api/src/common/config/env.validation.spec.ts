import { envValidationSchema } from './env.validation';

describe('Environment Validation', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: 3000,
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
    LOG_LEVEL: 'info',
    // GAP-3 (REQ-09): DASHBOARD_URL is required
    DASHBOARD_URL: 'http://localhost:3001',
  };

  it('should validate correct environment variables', () => {
    const { error } = envValidationSchema.validate(validEnv);
    expect(error).toBeUndefined();
  });

  it('should fail when DATABASE_URL is missing', () => {
    const { error } = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain('DATABASE_URL');
  });

  it('should apply defaults for optional fields', () => {
    const { value } = envValidationSchema.validate({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      DASHBOARD_URL: 'http://localhost:3001',
    });

    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(3000);
    expect(value.LOG_LEVEL).toBe('info');
  });

  it('should reject invalid NODE_ENV values', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      NODE_ENV: 'invalid',
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain('NODE_ENV');
  });

  it('should reject invalid LOG_LEVEL values', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      LOG_LEVEL: 'invalid',
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain('LOG_LEVEL');
  });

  it('should accept valid PORT number', () => {
    const { error, value } = envValidationSchema.validate({
      ...validEnv,
      PORT: 8080,
    });

    expect(error).toBeUndefined();
    expect(value.PORT).toBe(8080);
  });

  it('AC-09 (GAP-3): should fail when DASHBOARD_URL is missing', () => {
    const { DATABASE_URL, DASHBOARD_URL: _unused, ...withoutDashboardUrl } = validEnv; // eslint-disable-line @typescript-eslint/no-unused-vars
    const { error } = envValidationSchema.validate({ ...withoutDashboardUrl, DATABASE_URL });
    expect(error).toBeDefined();
    expect(error?.message).toContain('DASHBOARD_URL');
  });

  it('AC-09 (GAP-3): should fail when DASHBOARD_URL is not a valid URI', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      DASHBOARD_URL: 'not-a-valid-url',
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('DASHBOARD_URL');
  });
});
