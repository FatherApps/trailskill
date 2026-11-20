import { codeEmail, formatDate, markedEmail } from '../emailTexts.ts';

describe('account deletion email texts', () => {
  it('formats a date in Spanish, in the Bogota calendar day', () => {
    expect(formatDate('2026-12-20T15:00:00.000Z')).toBe('20 de diciembre de 2026');
    // 02:00 UTC is still the previous evening in Bogota (UTC-5).
    expect(formatDate('2026-12-21T02:00:00.000Z')).toBe('20 de diciembre de 2026');
  });

  it('writes the code email with the code, its 10 minutes and the ignore notice', () => {
    const email = codeEmail('123456');
    expect(email.subject).toBe('Tu código para eliminar tu cuenta de Swimcro');
    expect(email.text).toContain('123456');
    expect(email.text).toContain('10 minutos');
    expect(email.text).toContain('ignora este mensaje');
  });

  it('writes the marked email with the date and how to cancel', () => {
    const email = markedEmail('2026-12-20T15:00:00.000Z');
    expect(email.text).toContain('20 de diciembre de 2026');
    expect(email.text).toContain('«Cancelar eliminación»');
    expect(email.text).toContain('inicia sesión con este correo');
  });
});
