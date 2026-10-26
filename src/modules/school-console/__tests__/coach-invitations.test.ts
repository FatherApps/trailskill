import { createInMemoryCoachInvitationRepository } from '../data/coachInvitations';

describe('in-memory coach invitation repository', () => {
  it('keeps the whole invitation with the school it was sent for', async () => {
    const repository = createInMemoryCoachInvitationRepository();

    await repository.invite('school-a', { name: 'Rosa', email: 'rosa@example.com', groupIds: ['g1', 'g2'] });

    expect(repository.sent).toEqual([{ schoolId: 'school-a', invitation: { name: 'Rosa', email: 'rosa@example.com', groupIds: ['g1', 'g2'] } }]);
  });
});
