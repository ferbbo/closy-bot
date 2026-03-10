import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditableCell } from './editable-cell';

// Mock sonner to prevent toast side-effects in unit tests
jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

describe('AC-06: EditableCell — render y edit mode', () => {
  it('renderiza en modo solo lectura por defecto (sin input)', () => {
    render(<EditableCell value="Camiseta Roja" type="text" onSave={jest.fn()} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Camiseta Roja')).toBeInTheDocument();
  });

  it('entra en modo edición al hacer clic mostrando el input con el valor actual', () => {
    render(<EditableCell value="Camiseta Roja" type="text" onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Camiseta Roja');
  });

  it('no llama onSave si el valor no cambia al hacer blur — AC-08 no-op path', () => {
    const onSave = jest.fn();
    render(<EditableCell value="Camiseta Roja" type="text" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.blur(screen.getByRole('textbox'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('ESC cancela la edición y revierte al valor original — AC-07', () => {
    render(<EditableCell value="Original" type="text" onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Modificado' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });

  it('llama onSave con el nuevo valor al hacer blur con cambio — AC-08 happy path', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<EditableCell value="Original" type="text" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nuevo Nombre' } });
    fireEvent.blur(screen.getByRole('textbox'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Nuevo Nombre'));
  });

  it('no entra en modo edición cuando disabled=true — AC-06 disabled', () => {
    render(<EditableCell value="Lectura" type="text" onSave={jest.fn()} disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
