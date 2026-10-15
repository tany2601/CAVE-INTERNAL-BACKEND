import { describe, it, expect } from 'vitest';
import { inferCategory, sortMenu } from './menu-order.js';

const row = (name: string, category: string | null, created: string, id = name) => ({ id, createdAt: new Date(created), service: { name, category } });

describe('menu order', () => {
  const menu = [
    row('The Basic (Haircut + Beard Trim)', 'Combo', '2026-10-01T10:00:05Z'),
    row('Clean-up', 'Skin', '2026-10-01T10:00:03Z'),
    row('Mystery service', null, '2026-10-01T10:00:00Z'),
    row('Beard Spa', 'Beard', '2026-10-01T10:00:02Z'),
    row('Haircut', 'Hair', '2026-10-01T10:00:01Z'),
    row('Hair Colour', 'hair', '2026-10-01T10:00:04Z'), // any capitalisation
    row('Gift card', 'Other', '2026-10-01T10:00:06Z'),
  ];

  it('goes Hair, Beard, Skin, Combo, then everything else, with no category last', () => {
    expect(sortMenu(menu).map((r) => r.service.name)).toEqual([
      'Haircut',
      'Hair Colour',
      'Beard Spa',
      'Clean-up',
      'The Basic (Haircut + Beard Trim)',
      'Gift card',
      'Mystery service',
    ]);
  });

  it('keeps the order they were added in inside a category, so renaming or re-pricing never moves one', () => {
    const renamed = menu.map((r) => (r.service.name === 'Haircut' ? { ...r, service: { ...r.service, name: 'Zzz Haircut (renamed)' } } : r));
    const after = sortMenu(renamed).map((r) => r.service.name);
    expect(after[0]).toBe('Zzz Haircut (renamed)'); // still first among Hair, despite sorting last alphabetically
    expect(after.slice(1, 3)).toEqual(['Hair Colour', 'Beard Spa']);
  });

  it('a new service added to a category lands at the end of that category, not at the end of the menu', () => {
    const next = sortMenu([...menu, row('Hair Spa', 'Hair', '2026-10-02T09:00:00Z')]).map((r) => r.service.name);
    expect(next.indexOf('Hair Spa')).toBe(2); // after Haircut and Hair Colour, before Beard Spa
  });

  it('does not change the list it was given', () => {
    const copy = [...menu];
    sortMenu(menu);
    expect(menu).toEqual(copy);
  });

  it('guesses the category from the name when none was saved, so nobody has to pick one', () => {
    const cases: [string, string | null][] = [
      ['Haircut + Hair Wash & Style', 'Hair'],
      ['Hair Colour', 'Hair'],
      ['Head Massage', 'Hair'],
      ['Styling', 'Hair'],
      ['Beard Trim & Shape', 'Beard'],
      ['Beard Colour', 'Beard'], // Beard wins over "colour"
      ['Brightening Facial', 'Skin'],
      ['Clean-up', 'Skin'],
      ['De-Tan Treatment', 'Skin'],
      ['The Basic (Haircut + Beard Trim + Head Massage)', 'Combo'],
      ['Gift card', null],
    ];
    for (const [name, want] of cases) expect(inferCategory(name), name).toBe(want);
  });

  it('orders services that have no saved category by that guess', () => {
    const noCats = [
      row('Brightening Facial', null, '2026-10-01T10:00:01Z'),
      row('Beard Colour', null, '2026-10-01T10:00:02Z'),
      row('The Basic (Haircut + Beard Trim)', null, '2026-10-01T10:00:03Z'),
      row('Haircut', null, '2026-10-01T10:00:04Z'),
      row('Gift card', null, '2026-10-01T10:00:00Z'),
    ];
    expect(sortMenu(noCats).map((r) => r.service.name)).toEqual([
      'Haircut',
      'Beard Colour',
      'Brightening Facial',
      'The Basic (Haircut + Beard Trim)',
      'Gift card',
    ]);
  });
});
