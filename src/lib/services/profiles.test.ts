import { AuthSessionMissingError, createClient, type User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/database.types";
import {
  getOwnProfile,
  getOwnProfileNames,
  updateProfileDetails,
  updateProfilePreferences,
  type ProfileRow,
} from "./profiles";

const fetchMock = vi.fn<typeof fetch>();
const client = createClient<Database>("http://127.0.0.1:54321", "test-key", {
  global: { fetch: fetchMock },
  auth: { persistSession: false, autoRefreshToken: false },
});
const user: User = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-10-19T00:00:00Z",
};
const profile: ProfileRow = {
  id: user.id,
  first_name: null,
  last_name: null,
  default_currency: "PLN",
  language: "pl",
  created_at: user.created_at,
  updated_at: user.created_at,
};

function reply(data: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  return new URL(input instanceof Request ? input.url : input);
}

function requestBody(body: RequestInit["body"]): unknown {
  if (typeof body !== "string") throw new Error("Expected a JSON request body");
  return JSON.parse(body);
}

beforeEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
  vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user }, error: null });
});

describe("own profile reads", () => {
  it("reads only the authenticated user's profile", async () => {
    reply(profile);
    expect(await getOwnProfile(client)).toEqual(profile);
    const url = requestUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("id")).toBe(`eq.${user.id}`);
    expect(url.searchParams.get("select")).toBe("*");
  });

  it("loads only the fields required by the header", async () => {
    reply({ first_name: "Anna", last_name: null });
    expect(await getOwnProfileNames(client)).toEqual({ first_name: "Anna", last_name: null });
    const url = requestUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("select")).toBe("first_name,last_name");
    expect(url.searchParams.get("id")).toBe(`eq.${user.id}`);
  });
});

describe("own profile writes", () => {
  it("writes only name fields and returns the saved row", async () => {
    const saved = { ...profile, first_name: "Łukasz" };
    reply(saved);
    expect(await updateProfileDetails(client, { firstName: "Łukasz", lastName: null })).toEqual(saved);
    const [url, options] = fetchMock.mock.calls[0];
    expect(requestUrl(url).searchParams.get("id")).toBe(`eq.${user.id}`);
    expect(options?.method).toBe("PATCH");
    const body = requestBody(options?.body);
    expect(body).toEqual({ first_name: "Łukasz", last_name: null });
  });

  it("updates currency and language with a single request", async () => {
    const saved = { ...profile, default_currency: "EUR", language: "en" };
    reply(saved);
    expect(await updateProfilePreferences(client, { defaultCurrency: "EUR", language: "en" })).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(requestUrl(url).searchParams.get("id")).toBe(`eq.${user.id}`);
    expect(options?.method).toBe("PATCH");
    const body = requestBody(options?.body);
    expect(body).toEqual({ default_currency: "EUR", language: "en" });
  });
});

const operations = [
  ["profile read", () => getOwnProfile(client)],
  ["name read", () => getOwnProfileNames(client)],
  ["details update", () => updateProfileDetails(client, { firstName: null, lastName: null })],
  ["preferences update", () => updateProfilePreferences(client, { defaultCurrency: "EUR", language: "en" })],
] as const;

describe.each(operations)("%s failures", (_name, operation) => {
  it("does not query without an authenticated session", async () => {
    vi.spyOn(client.auth, "getUser").mockResolvedValueOnce({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    await expect(operation()).rejects.toBeInstanceOf(AuthSessionMissingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates database errors", async () => {
    reply({ code: "XX000", message: "Database failure", details: "", hint: "" }, 500);
    await expect(operation()).rejects.toMatchObject({ code: "XX000" });
  });

  it("rejects missing rows instead of inventing profile data or success", async () => {
    reply({ code: "PGRST116", message: "No rows", details: "", hint: "" }, 406);
    await expect(operation()).rejects.toMatchObject({ code: "PGRST116" });
  });

  it("rejects an unexpected empty response", async () => {
    reply(null);
    await expect(operation()).rejects.toThrow("Profile not found");
  });
});
