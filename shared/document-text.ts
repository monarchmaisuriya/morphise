import { documentSchema, type ProfileDocument } from "./document";

export type ParsedDocument = { ok: true; document: ProfileDocument } | { ok: false; errors: string[] };

// The editor's text goes through the same schema the daemon enforces on save, so errors show
// with their JSON path before a save is attempted.
export function parseDocumentText(text: string): ParsedDocument {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const result = documentSchema.safeParse(json);
  if (result.success) return { ok: true, document: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`),
  };
}

export function formatDocument(document: ProfileDocument): string {
  return JSON.stringify(document, null, 2);
}
