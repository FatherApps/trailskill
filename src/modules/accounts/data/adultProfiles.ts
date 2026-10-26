import { supabase } from '../../../core/sync';

export type AdultProfile = { userId: string; firstName: string; lastName: string };

// The adult's own profile. Not synced by PowerSync: it is written once, right after the account exists.
// A profile that already exists is never overwritten: save returns the stored one.
export type AdultProfileRepository = {
  save(profile: AdultProfile): Promise<AdultProfile>;
};

export function createSupabaseAdultProfileRepository(): AdultProfileRepository {
  return {
    async save({ userId, firstName, lastName }) {
      const found = await supabase.from('adult_profiles').select('first_name, last_name').eq('user_id', userId).maybeSingle();
      if (found.error) throw found.error;
      if (found.data) return { userId, firstName: found.data.first_name, lastName: found.data.last_name };
      const { error } = await supabase
        .from('adult_profiles')
        .upsert({ user_id: userId, first_name: firstName, last_name: lastName }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (error) throw error;
      return { userId, firstName, lastName };
    },
  };
}

export function createInMemoryAdultProfileRepository(options: { failing?: boolean; existing?: AdultProfile } = {}) {
  const saved: AdultProfile[] = options.existing ? [options.existing] : [];
  const repository = {
    saved,
    failing: options.failing ?? false,
    async save(profile: AdultProfile) {
      if (repository.failing) throw new Error('save failed');
      const kept = saved.find((stored) => stored.userId === profile.userId);
      if (kept) return kept;
      saved.push(profile);
      return profile;
    },
  };
  return repository;
}
