'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProductImageUpload } from './product-image-upload';
import { useProductImage } from '@/hooks/use-product-image';
import type { Product } from '@/lib/api';

interface ImageModalProps {
  product: Product;
  open: boolean;
  onClose: () => void;
}

/**
 * AC-07: Modal with image preview, "Cambiar imagen" and "Eliminar imagen" (with inline confirm).
 * When product has no image, shows the upload zone directly.
 */
export function ImageModal({ product, open, onClose }: ImageModalProps) {
  const { uploadImage, deleteImage } = useProductImage();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const hasImage = Boolean(product.imageUrl);
  const showUploadZone = showUpload || !hasImage;

  function handleClose() {
    setPendingFile(null);
    setConfirmDelete(false);
    setShowUpload(false);
    onClose();
  }

  async function handleUpload() {
    if (!pendingFile) return;
    await uploadImage.mutateAsync({ productId: product.id, file: pendingFile }).catch(() => {});
    handleClose();
  }

  async function handleDelete() {
    await deleteImage.mutateAsync({ productId: product.id }).catch(() => {});
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent onClose={handleClose}>
        <DialogHeader>
          <DialogTitle>
            {showUploadZone ? 'Subir imagen' : 'Imagen del producto'}
          </DialogTitle>
        </DialogHeader>

        {showUploadZone ? (
          <div className="space-y-4">
            {/* "Volver" button when switching from preview to upload */}
            {hasImage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowUpload(false); setPendingFile(null); }}
              >
                ← Volver
              </Button>
            )}

            <ProductImageUpload
              onFileSelected={setPendingFile}
              isUploading={uploadImage.isPending}
            />

            <Button
              className="w-full"
              disabled={!pendingFile || uploadImage.isPending}
              onClick={handleUpload}
            >
              {uploadImage.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Subiendo...
                </span>
              ) : (
                'Subir imagen'
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-48 object-cover rounded-lg border border-gray-200"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowUpload(true)}
              >
                Cambiar imagen
              </Button>

              {/* Inline delete confirm (AC-07) */}
              {confirmDelete ? (
                <div className="flex gap-1 flex-1">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={deleteImage.isPending}
                    onClick={handleDelete}
                  >
                    {deleteImage.isPending ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Eliminando...
                      </span>
                    ) : (
                      '¿Confirmar?'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirmDelete(false)}
                    aria-label="Cancelar eliminación"
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setConfirmDelete(true)}
                >
                  Eliminar imagen
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
