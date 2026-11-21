import { useEffect, useState } from 'react';

import { useSession } from '../../../core/session';
import { db } from '../../../core/sync';
import { createPowerSyncAuthorizationStatusRepository } from '../../accounts';
import { createPowerSyncSchoolAthleteRepository } from '../../athletes';
import { createPowerSyncSchoolStructureRepository, createPowerSyncStaffSchoolRepository } from '../../school-console';
import { createPowerSyncSeriesRepository } from '../../timing';
import { createPowerSyncAssignmentRepository } from '../data/powerSyncAssignmentRepository';
import { createPowerSyncFulfillmentRepository } from '../data/powerSyncFulfillmentRepository';
import { createPowerSyncTrainingPlanRepository } from '../data/powerSyncTrainingPlanRepository';
import { FulfillmentContainer, type FulfillmentContainerProps } from './FulfillmentContainer';

export type FulfillmentRepositories = Pick<
  FulfillmentContainerProps,
  'plans' | 'assignments' | 'athletes' | 'structure' | 'schools' | 'fulfillment' | 'authorizations' | 'series'
>;

// Built on first use, so importing the module opens nothing; the PowerSync implementations are the default, tests pass in-memory ones.
let powerSync: FulfillmentRepositories | undefined;
function powerSyncRepositories(): FulfillmentRepositories {
  powerSync ??= {
    plans: createPowerSyncTrainingPlanRepository(),
    assignments: createPowerSyncAssignmentRepository(),
    athletes: createPowerSyncSchoolAthleteRepository(),
    structure: createPowerSyncSchoolStructureRepository(),
    schools: createPowerSyncStaffSchoolRepository(),
    fulfillment: createPowerSyncFulfillmentRepository(),
    authorizations: createPowerSyncAuthorizationStatusRepository(),
    series: createPowerSyncSeriesRepository(),
  };
  return powerSync;
}

export type FulfillmentFlowProps = Pick<FulfillmentContainerProps, 'onOpenTiming' | 'refreshKey' | 'Avatar' | 'onBack'> & {
  // The assignment to mark and its day (YYYY-MM-DD); nothing shows until both are known.
  assignmentId?: string;
  day?: string;
  repositories?: FulfillmentRepositories;
};

// The grid of one assignment for the signed-in user on this device, with the repositories of the app.
export function FulfillmentFlow({ assignmentId, day, onOpenTiming, refreshKey, Avatar, onBack, repositories = powerSyncRepositories() }: FulfillmentFlowProps) {
  const { session } = useSession();
  const [deviceId, setDeviceId] = useState<string>();
  useEffect(() => {
    db.getClientId()
      .then(setDeviceId)
      .catch(() => {});
  }, []);

  if (!session || !deviceId || !assignmentId || !day) return null;
  return (
    <FulfillmentContainer
      {...repositories}
      Avatar={Avatar}
      userId={session.user.id}
      deviceId={deviceId}
      assignmentId={assignmentId}
      day={day}
      refreshKey={refreshKey}
      onOpenTiming={onOpenTiming}
      onBack={onBack}
    />
  );
}
