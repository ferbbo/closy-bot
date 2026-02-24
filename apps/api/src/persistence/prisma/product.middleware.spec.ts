import { Prisma } from '@prisma/client';
import { createProductSearchTextMiddleware } from './product.middleware';

describe('ProductSearchTextMiddleware - AC-07, AC-08', () => {
  let middleware: Prisma.Middleware;
  let mockNext: jest.Mock;

  beforeEach(() => {
    middleware = createProductSearchTextMiddleware();
    mockNext = jest.fn((_params) => Promise.resolve({ id: 'test' }));
  });

  it('AC-07: should auto-generate searchText on product create', async () => {
    const params: Prisma.MiddlewareParams = {
      model: 'Product',
      action: 'create',
      args: {
        data: {
          name: 'Test Product',
          brand: 'TestBrand',
          description: 'A test product description',
          tags: ['tag1', 'tag2'],
        },
      },
      dataPath: [],
      runInTransaction: false,
    };

    await middleware(params, mockNext);

    expect(params.args.data.searchText).toBe(
      'Test Product TestBrand A test product description tag1 tag2',
    );
    expect(mockNext).toHaveBeenCalledWith(params);
  });

  it('AC-07: should handle missing optional fields in create', async () => {
    const params: Prisma.MiddlewareParams = {
      model: 'Product',
      action: 'create',
      args: {
        data: {
          name: 'Only Name',
          // No brand, description, or tags
        },
      },
      dataPath: [],
      runInTransaction: false,
    };

    await middleware(params, mockNext);

    expect(params.args.data.searchText).toBe('Only Name');
    expect(mockNext).toHaveBeenCalled();
  });

  it('AC-08: should regenerate searchText on product update', async () => {
    const params: Prisma.MiddlewareParams = {
      model: 'Product',
      action: 'update',
      args: {
        where: { id: 'prod_123' },
        data: {
          name: 'Updated Name',
          description: 'Updated description',
        },
      },
      dataPath: [],
      runInTransaction: false,
    };

    await middleware(params, mockNext);

    expect(params.args.data.searchText).toBe('Updated Name Updated description');
    expect(mockNext).toHaveBeenCalled();
  });

  it('AC-08: should handle nested update syntax', async () => {
    const params: Prisma.MiddlewareParams = {
      model: 'Product',
      action: 'update',
      args: {
        where: { id: 'prod_123' },
        data: {
          name: { set: 'Nested Update' },
          brand: { set: 'NewBrand' },
          tags: { set: ['newtag'] },
        },
      },
      dataPath: [],
      runInTransaction: false,
    };

    await middleware(params, mockNext);

    expect(params.args.data.searchText).toBe('Nested Update NewBrand newtag');
    expect(mockNext).toHaveBeenCalled();
  });

  it('should not modify non-Product models', async () => {
    const params: Prisma.MiddlewareParams = {
      model: 'Category',
      action: 'create',
      args: {
        data: {
          name: 'Test Category',
        },
      },
      dataPath: [],
      runInTransaction: false,
    };

    const originalData = { ...params.args.data };

    await middleware(params, mockNext);

    expect(params.args.data).toEqual(originalData);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should not modify non-create/update actions', async () => {
    const params: Prisma.MiddlewareParams = {
      model: 'Product',
      action: 'findMany',
      args: {},
      dataPath: [],
      runInTransaction: false,
    };

    await middleware(params, mockNext);

    expect(params.args.data).toBeUndefined();
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle empty tags array', async () => {
    const params: Prisma.MiddlewareParams = {
      model: 'Product',
      action: 'create',
      args: {
        data: {
          name: 'Product',
          tags: [],
        },
      },
      dataPath: [],
      runInTransaction: false,
    };

    await middleware(params, mockNext);

    expect(params.args.data.searchText).toBe('Product');
    expect(mockNext).toHaveBeenCalled();
  });
});
