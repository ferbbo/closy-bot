'use client';

import { useAuth } from '@/hooks/use-auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function DashboardPage() {
  const { merchant, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        <Card>
          <CardHeader>
            <CardTitle>Información del negocio</CardTitle>
            <CardDescription>Datos de tu cuenta de comerciante</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Nombre del negocio</p>
              <p className="font-medium">{merchant?.businessName ?? '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{merchant?.email ?? '-'}</p>
            </div>
            {merchant?.industry && (
              <div>
                <p className="text-sm text-gray-500">Industria</p>
                <p className="font-medium">{merchant.industry}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
