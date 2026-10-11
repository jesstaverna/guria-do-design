import { describe, expect, it } from 'vitest';
import { formatBytes, parseLink, safeFileName, validateFile } from './attachments';

describe('anexos', () => {
  it('valida tamanho e extensões perigosas', () => {
    expect(validateFile('logo.pdf', 1000)).toBeNull();
    expect(validateFile('x.pdf', 0)).toMatch(/vazio/);
    expect(validateFile('grande.zip', 26 * 1024 * 1024)).toMatch(/25 MB/);
    expect(validateFile('pagina.HTML', 10)).toMatch(/não são permitidos/);
    expect(validateFile('icone.svg', 10)).toMatch(/não são permitidos/);
  });
  it('sanitiza nome do arquivo', () => {
    expect(safeFileName('Proposta – Ação final (v2).pdf')).toBe('Proposta_Acao_final_v2_.pdf');
    expect(safeFileName('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(safeFileName('')).toBe('arquivo');
  });
  it('reconhece links; só http(s)', () => {
    expect(parseLink('https://drive.google.com/file/d/abc/view')).toMatchObject({ provider: 'google_drive' });
    expect(parseLink('https://docs.google.com/document/d/1/edit')).toMatchObject({ provider: 'google_drive' });
    expect(parseLink('https://www.figma.com/file/x')).toMatchObject({ provider: 'outro', host: 'figma.com' });
    expect(parseLink('javascript:alert(1)')).toBeNull();
    expect(parseLink('drive.google.com/x')).toBeNull();
  });
  it('formata bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB');
  });
});
