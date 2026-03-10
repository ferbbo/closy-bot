'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface EditableCellProps {
  /** Current persisted value */
  value: string | number;
  /** Input type — 'text' for name, 'number' for price/stock */
  type: 'text' | 'number';
  /** Called on blur with the new value; should throw on error so rollback triggers */
  onSave: (newValue: string | number) => Promise<void>;
  /** Max length for text inputs (client-side validation) */
  maxLength?: number;
  /** Minimum value for number inputs (client-side validation, e.g. 0 for price/stock) */
  min?: number;
  /** True if value must be an integer (e.g. stock) */
  requireInteger?: boolean;
  /** Optional display formatter — e.g. price → "$30.000" */
  formatDisplay?: (value: string | number) => string;
  /** Additional class for the wrapper div */
  className?: string;
  /** Disable editing (e.g. no primary variant) */
  disabled?: boolean;
}

/**
 * AC-06: Generic editable cell component.
 * Click → input (edit mode) → blur → validate → save → read-only.
 * Rollback to original value on validation error or save error.
 */
export function EditableCell({
  value,
  type,
  onSave,
  maxLength,
  min,
  requireInteger = false,
  formatDisplay,
  className,
  disabled = false,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState<string | number>(value);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync tempValue when external value changes (e.g. optimistic update rollback)
  useEffect(() => {
    if (!isEditing) {
      setTempValue(value);
    }
  }, [value, isEditing]);

  // Auto-focus + select all on entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = () => {
    if (!disabled && !isLoading) {
      setIsEditing(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Cancel edit — rollback to original
      setTempValue(value);
      setIsEditing(false);
    }
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  };

  const handleBlur = async () => {
    const rawInput = type === 'number' ? Number(tempValue) : String(tempValue).trim();

    // No-op: value did not change — AC-11 (no-op scenario)
    if (rawInput === value || String(rawInput) === String(value)) {
      setIsEditing(false);
      return;
    }

    // Client-side validation — AC-11
    if (type === 'number') {
      const numVal = rawInput as number;
      if (isNaN(numVal)) {
        toast.error('Ingresa un número válido');
        setTempValue(value);
        setIsEditing(false);
        return;
      }
      if (min !== undefined && numVal < min) {
        toast.error(`El valor debe ser mayor o igual a ${min}`);
        setTempValue(value);
        setIsEditing(false);
        return;
      }
      if (requireInteger && !Number.isInteger(numVal)) {
        toast.error('El valor debe ser un número entero');
        setTempValue(value);
        setIsEditing(false);
        return;
      }
    }

    if (type === 'text') {
      const strVal = rawInput as string;
      if (strVal.length === 0) {
        toast.error('El campo no puede estar vacío');
        setTempValue(value);
        setIsEditing(false);
        return;
      }
      if (maxLength && strVal.length > maxLength) {
        toast.error(`Máximo ${maxLength} caracteres`);
        setTempValue(value);
        setIsEditing(false);
        return;
      }
    }

    // Save — AC-12 (rollback on error)
    setIsLoading(true);
    try {
      await onSave(rawInput);
      setIsEditing(false);
    } catch {
      // Rollback to original value on error
      setTempValue(value);
      setIsEditing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const displayValue = formatDisplay ? formatDisplay(value) : value;

  return (
    <div
      className={cn('group relative cursor-pointer', className)}
      onClick={handleClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
      aria-label={disabled ? undefined : 'Click para editar'}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type={type}
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          maxLength={type === 'text' ? maxLength : undefined}
          min={type === 'number' ? min : undefined}
          step={requireInteger ? 1 : undefined}
          className="w-full min-w-0 px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          className={cn(
            'px-2 py-1 rounded text-sm',
            disabled
              ? 'cursor-default text-gray-400'
              : 'hover:bg-gray-50 group-hover:ring-1 group-hover:ring-gray-200',
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          ) : (
            displayValue
          )}
        </div>
      )}
    </div>
  );
}
