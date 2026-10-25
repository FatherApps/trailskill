import type { SchoolAthlete } from '../../athletes';

export type AssignmentTarget =
  | { kind: 'athlete'; athleteId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'category'; categoryId: string }
  | { kind: 'school' };

export type Assignment = {
  id: string;
  schoolId: string;
  planId: string;
  // The plan version the assignment runs with: the latest one when it was created.
  versionId: string;
  // YYYY-MM-DD, the day of the session.
  sessionDate: string;
  target: AssignmentTarget;
};

export type NewAssignment = Omit<Assignment, 'id' | 'versionId'>;

export interface AssignmentRepository {
  /** The assignments of the school for a day (YYYY-MM-DD), oldest first. Withdrawn assignments are not listed. */
  list(schoolId: string, sessionDate: string): Promise<Assignment[]>;
  /** Saves an assignment of the latest version of the plan; returns its id. Rejects with PlanNotAssignableError when the plan has no version in the school. */
  create(assignment: NewAssignment): Promise<string>;
  /**
   * Withdraws an assignment (logical withdrawal, never a delete): it disappears from `list` at once, its marks are kept,
   * and the server records who withdrew it. Withdrawing an already withdrawn assignment changes nothing; rejects when the assignment is not on this device.
   */
  withdraw(id: string): Promise<void>;
}

/** The plan does not exist, belongs to another school or has no version, so nothing was written. */
export class PlanNotAssignableError extends Error {
  constructor(public readonly planId: string) {
    super(`Plan ${planId} cannot be assigned in this school`);
    this.name = 'PlanNotAssignableError';
  }
}

/** The target (athlete, group or category) is not part of the school of the assignment. */
export class TargetOutsideSchoolError extends Error {
  constructor(public readonly target: AssignmentTarget) {
    super(`The ${target.kind} target does not belong to the school`);
    this.name = 'TargetOutsideSchoolError';
  }
}

/** The target is in the school, but the user does not have it in charge (a coach assigns only own athletes and groups). */
export class TargetNotInChargeError extends Error {
  constructor(public readonly target: AssignmentTarget) {
    super(`The ${target.kind} target is not in charge of the user`);
    this.name = 'TargetNotInChargeError';
  }
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Throws when the text is not a real calendar day written as YYYY-MM-DD; both repositories call it before writing. */
export function validateSessionDate(date: string): void {
  const match = DATE.exec(date);
  const day = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (!day || day.toISOString().slice(0, 10) !== date) throw new Error(`Invalid session date: ${date}`);
}

/** The ids of the athletes an assignment reaches, among the athletes of its school. */
export function athletesOfTarget(target: AssignmentTarget, athletes: readonly SchoolAthlete[]): string[] {
  const reached = athletes.filter((athlete) => {
    switch (target.kind) {
      case 'athlete':
        return athlete.id === target.athleteId;
      case 'group':
        return athlete.groupIds.includes(target.groupId);
      case 'category':
        return athlete.categoryId === target.categoryId;
      case 'school':
        return true;
    }
  });
  return reached.map((athlete) => athlete.id);
}

/** The columns of the target; the school target has none. */
export function targetColumns(target: AssignmentTarget) {
  return {
    target: target.kind,
    athlete_id: target.kind === 'athlete' ? target.athleteId : null,
    group_id: target.kind === 'group' ? target.groupId : null,
    category_id: target.kind === 'category' ? target.categoryId : null,
  };
}
