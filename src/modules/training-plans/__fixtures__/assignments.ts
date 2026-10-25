import { createInMemorySchoolAthleteRepository } from '../../athletes';
import { createInMemorySchoolStructureRepository, createInMemoryStaffSchoolRepository } from '../../school-console';
import type { Plan, PlanBlock } from '..';

// Synthetic data only. School 1: groups g1 and g2, categories c1 and c2, five athletes; school 2 has its own.
const athleteRows = {
  athletes: ['a1', 'a2', 'a3', 'a4', 'a5', 'x1'].map((id) => ({ id, firstName: id.toUpperCase(), lastName: 'Sintético' })),
  athleteSchools: [
    { athleteId: 'a1', schoolId: 's1', categoryId: 'c1' },
    { athleteId: 'a2', schoolId: 's1', categoryId: 'c1' },
    { athleteId: 'a3', schoolId: 's1', categoryId: 'c2' },
    { athleteId: 'a4', schoolId: 's1', categoryId: null },
    { athleteId: 'a5', schoolId: 's1', categoryId: 'c2' },
    { athleteId: 'x1', schoolId: 's2', categoryId: 'c9' },
  ],
  athleteGroups: [
    { athleteId: 'a1', groupId: 'g1' },
    { athleteId: 'a2', groupId: 'g1' },
    { athleteId: 'a3', groupId: 'g2' },
    { athleteId: 'x1', groupId: 'g9' },
  ],
};
export const athletes = createInMemorySchoolAthleteRepository(athleteRows);
const structure = createInMemorySchoolStructureRepository({
  categories: [
    { id: 'c1', name: 'Infantil', sortOrder: 1, schoolId: 's1' },
    { id: 'c2', name: 'Juvenil', sortOrder: 2, schoolId: 's1' },
    { id: 'c9', name: 'Otra', sortOrder: 1, schoolId: 's2' },
  ],
  groups: [
    { id: 'g1', name: 'Grupo A', schoolId: 's1' },
    { id: 'g2', name: 'Grupo B', schoolId: 's1' },
    { id: 'g9', name: 'Grupo ajeno', schoolId: 's2' },
  ],
  // Coach k1 has group g1 and the athlete a4 directly.
  groupAssignments: [{ coachId: 'k1', groupId: 'g1' }],
  athleteAssignments: [{ coachId: 'k1', athleteId: 'a4' }],
  coachMemberships: [{ coachId: 'k1', schoolId: 's1' }],
});
const schools = createInMemoryStaffSchoolRepository([
  { schoolId: 's1', schoolName: 'Escuela Sintética', userId: 'admin', role: 'school_admin' },
  { schoolId: 's1', schoolName: 'Escuela Sintética', userId: 'k1', role: 'coach' },
]);
export const sources = { schools, athletes, structure };

const block: PlanBlock = { id: 'b1', phase: 'main', repetitions: 4, distance: 50, activity: 'FR', equipment: [], sendOffSeconds: null, recording: 'completion' };
export const plan = (id: string, schoolId = 's1'): Plan => ({ id, schoolId, name: `Plan ${id}`, isTemplate: false, blocks: [block] });

