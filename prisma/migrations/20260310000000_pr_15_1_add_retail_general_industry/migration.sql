-- PR-15.1: Add retail_general to Industry enum
-- REQ-01: Agregar retail_general al enum Industry en Prisma schema
ALTER TYPE "Industry" ADD VALUE 'retail_general';
