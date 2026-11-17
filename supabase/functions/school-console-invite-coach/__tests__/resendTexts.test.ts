import { resendBody, resendSubject } from '../resendTexts.ts';

const INVITATION = { id: 'invitation-secret-id', schoolId: '11111111-1111-4111-8111-111111111111', email: 'coach@example.test', schoolName: 'Escuela de prueba' };

describe('resend texts', () => {
  it('name the school in the subject and the body', () => {
    expect(resendSubject(INVITATION)).toContain('Escuela de prueba');
    expect(resendBody(INVITATION)).toContain('Escuela de prueba');
  });

  it('tell the coach to sign in to the app with the same email address', () => {
    expect(resendBody(INVITATION)).toMatch(/Swimcro/);
    expect(resendBody(INVITATION)).toMatch(/mismo correo/);
  });

  it('carry nothing else of the invitation: no id, school id, email or link', () => {
    const text = `${resendSubject(INVITATION)}\n${resendBody(INVITATION)}`;
    for (const secret of [INVITATION.id, INVITATION.schoolId, INVITATION.email]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/https?:/);
  });
});
