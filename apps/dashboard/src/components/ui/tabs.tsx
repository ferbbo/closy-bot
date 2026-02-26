'use client';

/**
 * Simple Tabs component (no Radix dependency)
 * State-based implementation following existing accordion.tsx pattern
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  activeTab: '',
  setActiveTab: () => {},
});

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  className,
  children,
}: TabsProps) {
  const [internalTab, setInternalTab] = React.useState(defaultValue);
  const activeTab = value ?? internalTab;

  const setActiveTab = React.useCallback(
    (v: string) => {
      setInternalTab(v);
      onValueChange?.(v);
    },
    [onValueChange],
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// List (nav bar)
// ---------------------------------------------------------------------------

interface TabsListProps {
  className?: string;
  children: React.ReactNode;
}

export function TabsList({ className, children }: TabsListProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg bg-gray-100 p-1 gap-1',
        className,
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

interface TabsTriggerProps {
  value: string;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function TabsTrigger({
  value,
  className,
  children,
  disabled,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab } = React.useContext(TabsContext);
  const isActive = activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

interface TabsContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

export function TabsContent({ value, className, children }: TabsContentProps) {
  const { activeTab } = React.useContext(TabsContext);
  if (activeTab !== value) return null;

  return (
    <div role="tabpanel" className={cn('mt-4', className)}>
      {children}
    </div>
  );
}
