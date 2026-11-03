// Test-only main service for deploy/scripts/functions.test.sh: it routes /<name> to /home/deno/functions/<name>
// the way the main service of the Supabase self-hosted template does, including the part that matters for the bundle:
// every worker gets the ONE import map at the root of the volume (deno.jsonc), and a deno.json inside a function is ignored.
// It skips the JWT check on purpose: the test has no JWT secret, and results-import authenticates the caller itself
// (a request without a user token gets 401).
Deno.serve(async (req: Request) => {
  const name = new URL(req.url).pathname.split('/')[1];
  if (!name) return Response.json({ msg: 'missing function name in request' }, { status: 400 });
  try {
    // deno-lint-ignore no-explicit-any
    const worker = await (globalThis as any).EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${name}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: '/home/deno/functions/deno.jsonc',
      envVars: Object.entries(Deno.env.toObject()),
      forceCreate: false,
      netAccessDisabled: false,
      cpuTimeSoftLimitMs: 1000,
      cpuTimeHardLimitMs: 2000,
    });
    return await worker.fetch(req);
  } catch (error) {
    return Response.json({ msg: String(error) }, { status: 500 });
  }
});
