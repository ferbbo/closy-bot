'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

/**
 * CancelOrderModal
 * REQ-13, AC-17
 * Modal de confirmación antes de cancelar un pedido
 */

interface CancelOrderModalProps {
  open: boolean;
  orderCode?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CancelOrderModal({
  open,
  orderCode,
  onConfirm,
  onCancel,
  isLoading = false,
}: CancelOrderModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent onClose={onCancel}>
        <DialogHeader>
          <DialogTitle>¿Cancelar pedido {orderCode}?</DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. El pedido pasará a estado
            <strong> Cancelado</strong> y no podrá modificarse.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Volver
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Cancelando...' : 'Sí, cancelar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
