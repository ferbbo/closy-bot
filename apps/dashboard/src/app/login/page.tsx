'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = api.getGoogleAuthUrl();
  };

  const handleMicrosoftLogin = () => {
    window.location.href = api.getMicrosoftAuthUrl();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Closy Bot</CardTitle>
          <CardDescription>
            Inicia sesión para acceder a tu dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleGoogleLogin} className="w-full" size="lg">
            Continuar con Google
          </Button>
          <Button
            onClick={handleMicrosoftLogin}
            variant="outline"
            className="w-full"
            size="lg"
          >
            Continuar con Microsoft
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
