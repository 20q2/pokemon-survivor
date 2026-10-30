import { beforeAll, describe, expect, it } from 'vitest';

// DamageNumbers bakes a bitmap font onto canvases at construction; stub just enough DOM for that.
beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

describe('damage-number labels', () => {
  it('drops ordinary labels at the cap but a hostile raid name always shows', async () => {
    const { DamageNumbers } = await import('../src/render/fx.ts');
    const n = new DamageNumbers();
    for (let i = 0; i < DamageNumbers.LABEL_CAP + 3; i++) n.label(0, 0, `roll ${i}`, '#fff');
    expect(n.labelTexts).toHaveLength(DamageNumbers.LABEL_CAP);
    expect(n.labelTexts).not.toContain(`roll ${DamageNumbers.LABEL_CAP}`);
    n.label(0, 0, 'Earthquake!', '#f00', 1.5, 8, true);
    expect(n.labelTexts).toContain('Earthquake!');
    expect(n.labelTexts).toHaveLength(DamageNumbers.LABEL_CAP);
    expect(n.labelTexts).not.toContain('roll 0'); // the oldest ordinary label made room
  });

  it('never evicts another priority label', async () => {
    const { DamageNumbers } = await import('../src/render/fx.ts');
    const n = new DamageNumbers();
    for (let i = 0; i < DamageNumbers.LABEL_CAP; i++) n.label(0, 0, `raid ${i}`, '#f00', 1.5, 8, true);
    n.label(0, 0, 'late', '#f00', 1.5, 8, true);
    expect(n.labelTexts).toHaveLength(DamageNumbers.LABEL_CAP);
    expect(n.labelTexts).not.toContain('late');
  });
});
