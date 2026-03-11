import { render, fireEvent } from '@testing-library/react';
import { toast } from 'sonner';
import { ProductImageUpload } from './product-image-upload';

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

function getFileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('AC-09: ProductImageUpload — validación client-side', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra toast error y no llama onFileSelected cuando archivo supera 5 MB', () => {
    const onFileSelected = jest.fn();
    const { container } = render(
      <ProductImageUpload onFileSelected={onFileSelected} />,
    );

    const bigFile = new File([''], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });

    fireEvent.change(getFileInput(container), { target: { files: [bigFile] } });

    expect(toast.error).toHaveBeenCalledWith('Imagen demasiado grande. Máximo 5 MB');
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('muestra toast error y no llama onFileSelected cuando tipo de archivo no es soportado', () => {
    const onFileSelected = jest.fn();
    const { container } = render(
      <ProductImageUpload onFileSelected={onFileSelected} />,
    );

    const pdfFile = new File([''], 'documento.pdf', { type: 'application/pdf' });

    fireEvent.change(getFileInput(container), { target: { files: [pdfFile] } });

    expect(toast.error).toHaveBeenCalledWith('Solo se permiten JPEG, PNG o WebP');
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('llama onFileSelected con archivo válido (JPEG dentro de 5 MB)', () => {
    // Mock URL.createObjectURL since jsdom doesn't support it
    const mockUrl = 'blob:mock-url';
    global.URL.createObjectURL = jest.fn().mockReturnValue(mockUrl);
    global.URL.revokeObjectURL = jest.fn();

    const onFileSelected = jest.fn();
    const { container } = render(
      <ProductImageUpload onFileSelected={onFileSelected} />,
    );

    const validFile = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(validFile, 'size', { value: 1 * 1024 * 1024 });

    fireEvent.change(getFileInput(container), { target: { files: [validFile] } });

    expect(toast.error).not.toHaveBeenCalled();
    expect(onFileSelected).toHaveBeenCalledWith(validFile);
  });

  it('muestra toast error para tipo image/gif (no en whitelist)', () => {
    const onFileSelected = jest.fn();
    const { container } = render(
      <ProductImageUpload onFileSelected={onFileSelected} />,
    );

    const gifFile = new File([''], 'anim.gif', { type: 'image/gif' });

    fireEvent.change(getFileInput(container), { target: { files: [gifFile] } });

    expect(toast.error).toHaveBeenCalledWith('Solo se permiten JPEG, PNG o WebP');
    expect(onFileSelected).not.toHaveBeenCalled();
  });
});
