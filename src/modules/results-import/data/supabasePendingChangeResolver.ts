import { supabase } from '../../../core/sync';
import type { PendingChangeResolver } from './officialResults';

type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: Error | null }> };

// Online only: the server checks that the user manages the athlete and keeps the authorization in force. A refusal or a lost
// connection is `false`, and the screen keeps showing the value imported before.
export function createSupabasePendingChangeResolver(client: RpcClient = supabase): PendingChangeResolver {
  return {
    async resolve(changeId, choice) {
      try {
        const { error } = await client.rpc('resolve_imported_result_change', { change: changeId, choice });
        return error === null;
      } catch {
        return false;
      }
    },
  };
}
