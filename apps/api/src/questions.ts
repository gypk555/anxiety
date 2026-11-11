import { QUESTIONS } from '@anxiocare/shared';
import type { Db } from './db.ts';

/** Its message names question ids only, never wording, and is safe to log. */
export class CatalogueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueError';
  }
}

interface QuestionRow {
  id: string;
  type: string;
  theme: string | null;
  position: number | null;
  text: string;
  answer_set: string;
  brings_help: boolean;
  active: boolean;
}

const expected = new Map(
  QUESTIONS.map((q) => [q.id, { type: q.type, theme: q.theme, position: q.position, text: q.text, answer_set: q.answerSet, brings_help: q.bringsHelp, active: q.active }]),
);

/**
 * Ids where the live `app.questions` differs from packages/shared/src/questions.ts: missing, extra, or any column
 * changed. Saved answers are read through the shared file, so a difference would show people the wrong question.
 */
export async function catalogueDifferences(sql: Db): Promise<string[]> {
  const rows = await sql<QuestionRow[]>`SELECT id, type, theme, position, text, answer_set, brings_help, active FROM app.questions`;
  const seen = new Set<string>();
  const differ: string[] = [];
  for (const row of rows) {
    seen.add(row.id);
    const want = expected.get(row.id);
    const { id: _id, ...have } = row;
    if (!want || JSON.stringify(Object.entries(have).sort()) !== JSON.stringify(Object.entries(want).sort())) differ.push(row.id);
  }
  for (const id of expected.keys()) if (!seen.has(id)) differ.push(id);
  return differ.sort();
}

/** The boot check: refuses to serve with a catalogue that doesn't match the shared file. */
export async function assertQuestionCatalogue(sql: Db): Promise<void> {
  const differ = await catalogueDifferences(sql);
  if (differ.length > 0) {
    const shown = differ.slice(0, 10).join(', ');
    throw new CatalogueError(`app.questions does not match the shared catalogue: ${shown}${differ.length > 10 ? ` and ${differ.length - 10} more` : ''}`);
  }
}
