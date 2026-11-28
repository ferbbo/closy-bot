import { MENU_PAGE_MAX_CHARS, MenuCategoryView, MenuPresenter, formatCop } from './menu.presenter';

describe('formatCop', () => {
  it('formatea COP con punto de miles', () => {
    expect(formatCop(16000)).toBe('$16.000');
    expect(formatCop(1500000)).toBe('$1.500.000');
    expect(formatCop(900)).toBe('$900');
    expect(formatCop(2500.4)).toBe('$2.500');
  });
});

describe('MenuPresenter', () => {
  const presenter = new MenuPresenter();
  const small: MenuCategoryView[] = [
    { name: 'Hamburguesas', items: [{ label: 'Hamburguesa sencilla', unitPrice: 16000 }] },
    { name: 'Bebidas', items: [{ label: 'Coca-Cola 400 ml', unitPrice: 4000 }] },
    { name: 'Vacía', items: [] },
  ];

  it('AC-09: categorías con productos y precios en una página', () => {
    expect(presenter.render(small)).toEqual({
      text: '*Hamburguesas*\n• Hamburguesa sencilla — $16.000\n\n*Bebidas*\n• Coca-Cola 400 ml — $4.000',
      page: 1,
      totalPages: 1,
    });
  });

  it('sin productos activos → null', () => {
    expect(presenter.render([{ name: 'X', items: [] }])).toBeNull();
  });

  it('AC-09: pagina cuando el menú pasa de 1.500 caracteres; cada página ≤ 1.500', () => {
    const big: MenuCategoryView[] = Array.from({ length: 6 }, (_, c) => ({
      name: `Categoría ${c}`,
      items: Array.from({ length: 10 }, (_, i) => ({
        label: `Producto número ${c}-${i} con nombre largo`,
        unitPrice: 10000 + i * 1000,
      })),
    }));
    const pages = presenter.paginate(big);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(MENU_PAGE_MAX_CHARS);
    const all = pages.join('\n');
    for (const cat of big) for (const item of cat.items) expect(all).toContain(item.label);

    const second = presenter.render(big, 2);
    expect(second?.page).toBe(2);
    expect(second?.totalPages).toBe(pages.length);
    expect(presenter.render(big, 99)?.page).toBe(pages.length);
  });

  it('parte una categoría que sola no cabe, con encabezado "(cont.)"', () => {
    const huge: MenuCategoryView[] = [
      {
        name: 'Perros',
        items: Array.from({ length: 60 }, (_, i) => ({ label: `Perro ${i}`, unitPrice: 12000 })),
      },
    ];
    const pages = presenter.paginate(huge, 300);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[1].startsWith('*Perros (cont.)*')).toBe(true);
    for (const p of pages) expect(p.length).toBeLessThanOrEqual(300);
  });
});
