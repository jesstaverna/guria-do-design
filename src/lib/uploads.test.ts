import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { readImage } from './uploads';

const file = (bytes: number[], size = bytes.length) => new File([new Uint8Array([...bytes, ...new Array(Math.max(size - bytes.length, 0)).fill(0)])], 'x');
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe('readImage', () => {
  it('aceita PNG, JPEG e WebP pelos bytes iniciais', async () => {
    expect(await readImage(file(PNG))).toMatchObject({ ok: true, type: 'image/png', ext: 'png' });
    expect(await readImage(file(JPG))).toMatchObject({ ok: true, type: 'image/jpeg', ext: 'jpg' });
    expect(await readImage(file(WEBP))).toMatchObject({ ok: true, type: 'image/webp', ext: 'webp' });
  });
  it('rejeita SVG/HTML mesmo com extensão de imagem, vazio e acima de 2 MB', async () => {
    expect(await readImage(file([...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')]))).toMatchObject({ ok: false });
    expect(await readImage(null)).toMatchObject({ ok: false });
    expect(await readImage(new File([], 'vazio.png'))).toMatchObject({ ok: false });
    expect(await readImage(file(PNG, 2 * 1024 * 1024 + 1))).toMatchObject({ ok: false, error: expect.stringContaining('2 MB') });
  });
});
