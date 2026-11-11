import { type Profile, profileSchema } from "./profile";

export type ParsedProfile = { ok: true; profile: Profile } | { ok: false; errors: string[] };

// The editor's text goes through the same schema the daemon enforces on save, so errors show
// with their JSON path before a save is attempted.
export function parseProfileText(text: string): ParsedProfile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const result = profileSchema.safeParse(json);
  if (result.success) return { ok: true, profile: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`),
  };
}

export function formatProfile(profile: Profile): string {
  return JSON.stringify(profile, null, 2);
}
