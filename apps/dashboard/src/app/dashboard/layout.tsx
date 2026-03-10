'use client';

import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  Menu,
  ShoppingBag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { usePendingOrdersCount } from '@/hooks/use-orders';
import { useMerchantProfile } from '@/hooks/use-playbook-config';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Canales', href: '/dashboard/channels', icon: MessageSquare },
  { name: 'Catálogo', href: '/dashboard/catalog', icon: Package },
  { name: 'Pedidos', href: '/dashboard/orders', icon: ShoppingBag },
  { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { merchant } = useAuth();
  const { data: profile } = useMerchantProfile();
  
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // REQ-14, AC-18: Contador de pedidos pendientes para sidebar badge
  const { data: pendingData } = usePendingOrdersCount();
  const pendingCount = pendingData?.count ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">{profile?.name ?? 'Tu tienda online'}</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Sidebar - Desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white">
          {/* Logo */}
          <div className="flex h-16 shrink-0 items-center border-b border-gray-200 px-6">
            <h1 className="text-xl font-bold text-gray-900">{profile?.name ?? 'Tu tienda online'}</h1>
          </div>

          {/* Navigation */}
          <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
            <nav className="flex-1 space-y-1 px-3">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      isActive
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                    )}
                  >
                    <Icon
                      className={cn(
                        'mr-3 h-5 w-5 flex-shrink-0',
                        isActive
                          ? 'text-gray-900'
                          : 'text-gray-400 group-hover:text-gray-900',
                      )}
                    />
                    <span className="flex-1">{item.name}</span>
                    {/* AC-18: Pending orders badge */}
                    {item.href === '/dashboard/orders' && pendingCount > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-5 h-5 px-1">
                        {pendingCount > 99 ? '99+' : pendingCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User info */}
          {merchant && (
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">
                      {merchant.name?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                </div>
                <div className="ml-3 min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {merchant.name || 'Usuario'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {merchant.email}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-gray-600 bg-opacity-75">
          <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white">
            {/* Mobile logo */}
            <div className="flex h-16 shrink-0 items-center border-b border-gray-200 px-6">
              <h1 className="text-xl font-bold text-gray-900">Closy Bot</h1>
            </div>

            {/* Mobile navigation */}
            <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
              <nav className="flex-1 space-y-1 px-3">
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                        isActive
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      )}
                    >
                      <Icon
                        className={cn(
                          'mr-3 h-5 w-5 flex-shrink-0',
                          isActive
                            ? 'text-gray-900'
                            : 'text-gray-400 group-hover:text-gray-900',
                        )}
                      />
                      <span className="flex-1">{item.name}</span>
                      {item.href === '/dashboard/orders' && pendingCount > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-5 h-5 px-1">
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Mobile user info */}
            {merchant && (
              <div className="border-t border-gray-200 p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {merchant.name?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {merchant.name || 'Usuario'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {merchant.email}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        <main className="py-16 lg:py-8 px-4 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
