import {
  createPowerSyncOwnAuthorizationEvidence,
  createSupabaseProfileEvidenceRepository,
} from "../data/profileGate";
import { providerAccountOf } from "../screens/ProviderRegistrationContainer";

type Answer = { data: unknown[] | null; error: Error | null };
const mockAnswers: Record<string, Answer> = {};
const mockAsked: { table: string; column: string; value: string }[] = [];
// The authorizations on the device. The fake answers like the SQL it is given: the rows of the user in the WHERE, all of them without it.
const mockAuthorizationRows: { user_id: string }[] = [];

jest.mock("../../../core/sync", () => ({
  db: {
    getAll: async (sql: string, params: string[]) =>
      /WHERE user_id = \?/.test(sql)
        ? mockAuthorizationRows.filter((row) => row.user_id === params[0])
        : mockAuthorizationRows,
  },
  supabase: {
    from: (table: string) => ({
      select: (column: string) => ({
        eq: (_column: string, value: string) => ({
          limit: async () => {
            mockAsked.push({ table, column, value });
            return mockAnswers[table] ?? { data: [], error: null };
          },
        }),
      }),
    }),
  },
}));
jest.mock("../../../core/sync/db", () => ({ db: {} }));
jest.mock("expo-secure-store", () => ({}));

beforeEach(() => {
  for (const key of Object.keys(mockAnswers)) delete mockAnswers[key];
  mockAsked.length = 0;
  mockAuthorizationRows.length = 0;
});

describe("the server evidence of a profile", () => {
  it("asks the four tables, each for the user's own rows", async () => {
    await createSupabaseProfileEvidenceRepository().hasProfile("user-1");

    expect(mockAsked.map((ask) => ask.table).sort()).toEqual([
      "adult_profiles",
      "athlete_managers",
      "platform_admins",
      "school_memberships",
    ]);
    expect(
      mockAsked.every(
        (ask) => ask.column === "user_id" && ask.value === "user-1",
      ),
    ).toBe(true);
  });

  it.each([
    "adult_profiles",
    "platform_admins",
    "school_memberships",
    "athlete_managers",
  ])("a row in %s is a profile", async (table) => {
    mockAnswers[table] = { data: [{ user_id: "user-1" }], error: null };

    await expect(
      createSupabaseProfileEvidenceRepository().hasProfile("user-1"),
    ).resolves.toBe(true);
  });

  it('no rows anywhere is a real "no"', async () => {
    await expect(
      createSupabaseProfileEvidenceRepository().hasProfile("user-1"),
    ).resolves.toBe(false);
  });

  it('an error is never a "no": it throws, even when another table has a row', async () => {
    mockAnswers.platform_admins = {
      data: null,
      error: new Error("Network request failed"),
    };
    mockAnswers.adult_profiles = { data: [{ user_id: "user-1" }], error: null };

    await expect(
      createSupabaseProfileEvidenceRepository().hasProfile("user-1"),
    ).rejects.toThrow("Network request failed");
  });
});

describe("the authorizations on the device as evidence of a profile", () => {
  const hasOwnAuthorizations = createPowerSyncOwnAuthorizationEvidence();

  it("counts an authorization of the user", async () => {
    mockAuthorizationRows.push({ user_id: "user-1" });

    await expect(hasOwnAuthorizations("user-1")).resolves.toBe(true);
  });

  it("does not count the authorization of another user on the same device", async () => {
    mockAuthorizationRows.push({ user_id: "someone-else" });

    await expect(hasOwnAuthorizations("user-1")).resolves.toBe(false);
  });

  it("no authorizations is a no", async () => {
    await expect(hasOwnAuthorizations("user-1")).resolves.toBe(false);
  });
});

describe("what the session already says about the person", () => {
  it("takes the names Google gives", () => {
    expect(
      providerAccountOf({
        email: "a@example.test",
        app_metadata: { provider: "google" },
        user_metadata: { given_name: "Paula", family_name: "Gómez" },
      }),
    ).toEqual({
      email: "a@example.test",
      provider: "google",
      firstName: "Paula",
      lastName: "Gómez",
    });
  });

  it("splits a full name when the provider gives no separate names (Microsoft)", () => {
    expect(
      providerAccountOf({
        email: "a@example.test",
        app_metadata: { provider: "azure" },
        user_metadata: { full_name: "Paula Gómez Ruiz" },
      }),
    ).toMatchObject({
      provider: "microsoft",
      firstName: "Paula",
      lastName: "Gómez Ruiz",
    });
  });

  it("a session from the emailed code has no provider and no names to suggest", () => {
    expect(
      providerAccountOf({
        email: "a@example.test",
        app_metadata: { provider: "email" },
      }),
    ).toEqual({
      email: "a@example.test",
      provider: undefined,
      firstName: "",
      lastName: "",
    });
  });
});
