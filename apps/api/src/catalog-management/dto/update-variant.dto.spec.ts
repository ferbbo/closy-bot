import { validate } from 'class-validator';
import { UpdateVariantDto } from './update-variant.dto';

/**
 * AC-01: UpdateVariantDto validates correctly
 * - price >= 0
 * - stock >= 0 and is integer
 * - all fields optional
 */
describe('AC-01: UpdateVariantDto validation', () => {
  it('should pass with valid price and stock', async () => {
    const dto = Object.assign(new UpdateVariantDto(), { price: 30000, stock: 10 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with only price provided (partial update)', async () => {
    const dto = Object.assign(new UpdateVariantDto(), { price: 15000 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with only stock provided (partial update)', async () => {
    const dto = Object.assign(new UpdateVariantDto(), { stock: 5 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with only isActive provided (partial update)', async () => {
    const dto = Object.assign(new UpdateVariantDto(), { isActive: false });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with empty DTO (all fields optional)', async () => {
    const dto = new UpdateVariantDto();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with price = 0 (minimum valid)', async () => {
    const dto = Object.assign(new UpdateVariantDto(), { price: 0 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with stock = 0 (minimum valid)', async () => {
    const dto = Object.assign(new UpdateVariantDto(), { stock: 0 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject negative price', async () => {
    const dto = Object.assign(new UpdateVariantDto(), { price: -100 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('price');
  });

  it('should reject negative stock', async () => {
    const dto = Object.assign(new UpdateVariantDto(), { stock: -1 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('stock');
  });

  it('should reject float stock (must be integer)', async () => {
    const dto = Object.assign(new UpdateVariantDto(), { stock: 2.5 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('stock');
  });

  it('should reject string price', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dto = Object.assign(new UpdateVariantDto(), { price: 'abc' as any });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('price');
  });

  it('should pass with all fields valid', async () => {
    const dto = Object.assign(new UpdateVariantDto(), {
      price: 45000,
      stock: 20,
      isActive: true,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
