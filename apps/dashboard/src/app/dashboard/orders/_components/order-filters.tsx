'use client';

import { useState, useCallback } from 'react';
import { OrderFilters, OrderStatus } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';

/**
 * OrderFilters component
 * REQ-11, AC-14
 * Filtros: status (multi-select chips), fecha (range inputs), orderCode (search)
 */

const ALL_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'pending_payment', label: 'Pendiente pago' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'paid', label: 'Pagado' },
  { value: 'shipped', label: 'Enviado' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'cancelled', label: 'Cancelado' },
];

interface OrderFiltersProps {
  filters: OrderFilters;
  onChange: (filters: OrderFilters) => void;
}

export function OrderFiltersBar({ filters, onChange }: OrderFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.orderCode ?? '');

  const toggleStatus = useCallback(
    (status: OrderStatus) => {
      const current = filters.status ?? [];
      const updated = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      onChange({ ...filters, status: updated.length > 0 ? updated : undefined, offset: 0 });
    },
    [filters, onChange],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchValue(value);
      // Debounce via setTimeout — simple approach
      const timer = setTimeout(() => {
        onChange({ ...filters, orderCode: value || undefined, offset: 0 });
      }, 300);
      return () => clearTimeout(timer);
    },
    [filters, onChange],
  );

  const handleDateChange = useCallback(
    (field: 'dateFrom' | 'dateTo', value: string) => {
      onChange({ ...filters, [field]: value || undefined, offset: 0 });
    },
    [filters, onChange],
  );

  const hasActiveFilters =
    (filters.status?.length ?? 0) > 0 ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.orderCode;

  const clearFilters = () => {
    setSearchValue('');
    onChange({});
  };

  return (
    <div className="space-y-3">
      {/* Search by order code */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por código de orden..."
          value={searchValue}
          onChange={handleSearchChange}
          className="pl-9 h-9"
        />
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {ALL_STATUSES.map((s) => {
          const isActive = filters.status?.includes(s.value);
          return (
            <button
              key={s.value}
              onClick={() => toggleStatus(s.value)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Date range */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Desde:</label>
          <Input
            type="date"
            value={filters.dateFrom ? filters.dateFrom.split('T')[0] : ''}
            onChange={(e) =>
              handleDateChange(
                'dateFrom',
                e.target.value ? `${e.target.value}T00:00:00Z` : '',
              )
            }
            className="h-8 text-xs w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Hasta:</label>
          <Input
            type="date"
            value={filters.dateTo ? filters.dateTo.split('T')[0] : ''}
            onChange={(e) =>
              handleDateChange(
                'dateTo',
                e.target.value ? `${e.target.value}T23:59:59Z` : '',
              )
            }
            className="h-8 text-xs w-auto"
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 text-xs text-gray-500 hover:text-red-600 ml-auto"
          >
            <X className="h-3 w-3 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
