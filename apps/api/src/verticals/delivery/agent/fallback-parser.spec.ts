import { ParsedOrderLine } from '../contracts';
import { parseOrderText } from './fallback-parser';

const l = (query: string, quantity = 1, notes = ''): ParsedOrderLine => ({
  query,
  quantity,
  notes,
});

/** 20 frases colombianas de fixture (base de AC-07). */
const FIXTURES: Array<[string, ParsedOrderLine[]]> = [
  ['2 hamburguesas sencillas sin cebolla y una coca 400', [l('hamburguesas sencillas', 2, 'sin cebolla'), l('coca 400')]],
  ['buenas! me mandas 2 hamburguesas sencillas sin cebolla y una coca de 400', [l('hamburguesas sencillas', 2, 'sin cebolla'), l('coca de 400')]],
  ['una hamburguesa doble', [l('hamburguesa doble')]],
  ['dos perros especiales, una salchipapa y tres cocas', [l('perros especiales', 2), l('salchipapa'), l('cocas', 3)]],
  ['media docena de empanadas', [l('empanadas', 6)]],
  ['una docena de alitas bbq', [l('alitas bbq', 12)]],
  ['3 perros sencillos sin cebolla y sin salsa', [l('perros sencillos', 3, 'sin cebolla y sin salsa')]],
  ['regálame un choriperro con queso extra', [l('choriperro', 1, 'con queso extra')]],
  ['quiero 2 hamburguesas de tocineta + 2 papas fritas', [l('hamburguesas de tocineta', 2), l('papas fritas', 2)]],
  ['una malteada de fresa por favor', [l('malteada de fresa')]],
  ['hola, me regalas cuatro jugos de mora en agua', [l('jugos de mora en agua', 4)]],
  ['1 coca 1.5 y 2 aguas', [l('coca 1.5'), l('aguas', 2)]],
  ['cinco hamburguesas sencillas, dos dobles', [l('hamburguesas sencillas', 5), l('dobles', 2)]],
  ['un perro especial extra tocineta', [l('perro especial', 1, 'extra tocineta')]],
  ['seis empanadas y un par de gaseosas', [l('empanadas', 6), l('gaseosas', 2)]],
  ['hamburguesa sencilla x2', [l('hamburguesa sencilla', 2)]],
  ['una sencilla sin tomate, una doble sin cebolla y dos cocas 400', [l('sencilla', 1, 'sin tomate'), l('doble', 1, 'sin cebolla'), l('cocas 400', 2)]],
  ['Buenas noches veci, me manda una hamburguesa de tocineta sin salsas porfa', [l('hamburguesa de tocineta', 1, 'sin salsas')]],
  ['ocho papas fritas\nnueve aguas', [l('papas fritas', 8), l('aguas', 9)]],
  ['siete perros sencillos con todo y una coca', [l('perros sencillos', 7, 'con todo'), l('coca')]],
]; // prettier-ignore

describe('parseOrderText', () => {
  it('tiene 20 frases de fixture', () => {
    expect(FIXTURES).toHaveLength(20);
  });

  it.each(FIXTURES)('AC-07 base: %j', (text, expected) => {
    expect(parseOrderText(text)).toEqual(expected);
  });

  it('"2 hamburguesas sencillas" (caso AC-07) → 1 línea con cantidad 2', () => {
    expect(parseOrderText('2 hamburguesas sencillas')).toEqual([l('hamburguesas sencillas', 2)]);
  });

  it('notas encadenadas sin cantidad se suman a la línea anterior', () => {
    expect(parseOrderText('2 perros con queso y tocineta')).toEqual([
      l('perros', 2, 'con queso y tocineta'),
    ]);
  });

  it('textos vacíos, solo saludo o cantidad 0 → []', () => {
    expect(parseOrderText('')).toEqual([]);
    expect(parseOrderText('hola, buenas!')).toEqual([]);
    expect(parseOrderText('0 hamburguesas')).toEqual([]);
    expect(parseOrderText(undefined as unknown as string)).toEqual([]);
  });

  it('conserva tildes y números del nombre', () => {
    expect(parseOrderText('2 jugos de maracuyá')).toEqual([l('jugos de maracuyá', 2)]);
    expect(parseOrderText('una coca 1.5 l.')).toEqual([l('coca 1.5 l')]);
  });
});
