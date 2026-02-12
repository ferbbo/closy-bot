import { envValidationSchema } from './env.validation';

describe('Environment Validation', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: 3000,
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
    LOG_LEVEL: 'info',
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
});
