import { Prisma } from '@prisma/client';

/**
 * PR-03.5.2: Middleware to auto-generate searchText for Product
 * Triggers on product.create and product.update
 * Concatenates: name + brand + description + tags
 */
export function createProductSearchTextMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    // Only apply to Product model
    if (params.model !== 'Product') {
      return next(params);
    }

    // Apply to create and update operations
    if (params.action === 'create' || params.action === 'update') {
      const data = params.args.data;

      // Generate searchText from available fields
      // Handle both direct values and nested update syntax
      const name = data.name?.set ?? data.name ?? '';
      const brand = data.brand?.set ?? data.brand ?? '';
      const description = data.description?.set ?? data.description ?? '';
      const tags = data.tags?.set ?? data.tags ?? [];

      // Concatenate fields with spaces
      const searchText = [name, brand, description, Array.isArray(tags) ? tags.join(' ') : '']
        .filter(Boolean)
        .join(' ')
        .trim();

      // Set searchText in the data
      if (searchText) {
        params.args.data.searchText = searchText;
      }
    }

    return next(params);
  };
}
