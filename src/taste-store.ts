import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SurfaceBinding, TasteDecision, TasteProfile } from "./taste.js";

export interface TasteStore {
  getProfile(name: string): Promise<unknown | null>;
  putProfile(profile: TasteProfile): Promise<void>;
  listProfiles(): Promise<Array<{ name: string; raw: unknown }>>;
  getSurfaces(name: string): Promise<unknown | null>;
  putSurfaces(name: string, bindings: SurfaceBinding[]): Promise<void>;
  getDecisions(name: string): Promise<unknown | null>;
  putDecisions(name: string, decisions: TasteDecision[]): Promise<void>;
  // OPTIONAL atomic single-decision append. Stores that can append without a
  // read-modify-write (Redis RPUSH) implement this; recordTasteDecision
  // prefers it when present. FsTasteStore intentionally does NOT implement it,
  // so the stdio path is byte-for-byte unchanged.
  appendDecision?(name: string, decision: TasteDecision): Promise<void>;
  // Human label for a store slot, used only in corrupt-store error messages.
  // Fs returns the absolute path; non-fs stores return the logical file name
  // (an absolute path would be a lie for a Redis-backed store).
  describe(name: string, kind: "profile" | "surfaces" | "decisions"): string;
}

export function tasteHome(): string {
  return process.env.RAVEN_TASTE_HOME || join(homedir(), ".raven", "taste");
}

export class FsTasteStore implements TasteStore {
  async getProfile(name: string): Promise<unknown | null> {
    const file = profilePath(name);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  }

  async putProfile(profile: TasteProfile): Promise<void> {
    const home = tasteHome();
    mkdirSync(home, { recursive: true });
    writeFileSync(profilePath(profile.name), JSON.stringify(profile, null, 2) + "\n", "utf8");
  }

  async listProfiles(): Promise<Array<{ name: string; raw: unknown }>> {
    const home = tasteHome();
    if (!existsSync(home)) return [];
    return readdirSync(home)
      .filter(function(file) {
        return file.endsWith(".json") && !file.endsWith(".surfaces.json") && !file.endsWith(".decisions.json");
      })
      .map(function(file) {
        return { name: file.slice(0, -5), raw: JSON.parse(readFileSync(join(home, file), "utf8")) };
      });
  }

  async getSurfaces(name: string): Promise<unknown | null> {
    const file = surfacesPath(name);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  }

  async putSurfaces(name: string, bindings: SurfaceBinding[]): Promise<void> {
    mkdirSync(tasteHome(), { recursive: true });
    writeFileSync(surfacesPath(name), JSON.stringify({ version: 1, bindings }, null, 2) + "\n", "utf8");
  }

  async getDecisions(name: string): Promise<unknown | null> {
    const file = decisionsPath(name);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  }

  async putDecisions(name: string, decisions: TasteDecision[]): Promise<void> {
    mkdirSync(tasteHome(), { recursive: true });
    writeFileSync(decisionsPath(name), JSON.stringify({ version: 1, decisions }, null, 2) + "\n", "utf8");
  }

  describe(name: string, kind: "profile" | "surfaces" | "decisions"): string {
    if (kind === "surfaces") return surfacesPath(name);
    if (kind === "decisions") return decisionsPath(name);
    return profilePath(name);
  }
}

export class ClosedTasteStore implements TasteStore {
  async getProfile(_name: string): Promise<unknown | null> {
    return null;
  }

  async putProfile(_profile: TasteProfile): Promise<void> {
    throw closedStoreError();
  }

  async listProfiles(): Promise<Array<{ name: string; raw: unknown }>> {
    return [];
  }

  async getSurfaces(_name: string): Promise<unknown | null> {
    return null;
  }

  async putSurfaces(_name: string, _bindings: SurfaceBinding[]): Promise<void> {
    throw closedStoreError();
  }

  async getDecisions(_name: string): Promise<unknown | null> {
    return null;
  }

  async putDecisions(_name: string, _decisions: TasteDecision[]): Promise<void> {
    throw closedStoreError();
  }

  describe(name: string, kind: "profile" | "surfaces" | "decisions"): string {
    if (kind === "surfaces") return name + ".surfaces.json";
    if (kind === "decisions") return name + ".decisions.json";
    return name + ".json";
  }
}

function closedStoreError(): Error {
  return new Error("Taste store is not available in remote runtime");
}

function profilePath(name: string): string {
  return join(tasteHome(), name + ".json");
}

function surfacesPath(name: string): string {
  return join(tasteHome(), name + ".surfaces.json");
}

function decisionsPath(name: string): string {
  return join(tasteHome(), name + ".decisions.json");
}
