import { supabase } from '../../../core/sync';

export type AdultProfile = { userId: string; firstName: string; lastName: string };

// The adult's own profile. Not synced by PowerSync: it is written once, right after the account exists.
export type AdultProfileRepository = {
  save(profile: AdultProfile): Promise<void>;
};

export function createSupabaseAdultProfileRepository(): AdultProfileRepository {
  return {
    async save({ userId, firstName, lastName }) {
      const { error } = await supabase
        .from('adult_profiles')
        .upsert({ user_id: userId, first_name: firstName, last_name: lastName }, { onConflict: 'user_id' });
      if (error) throw error;
    },
  };
}

export function createInMemoryAdultProfileRepository(options: { failing?: boolean } = {}) {
  const saved: AdultProfile[] = [];
  const repository = {
    saved,
    failing: options.failing ?? false,
    async save(profile: AdultProfile) {
      if (repository.failing) throw new Error('save failed');
      saved.push(profile);
    },
  };
  return repository;
}
