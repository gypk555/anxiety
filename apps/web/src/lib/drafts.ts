import type { JournalInput } from '@anxiocare/shared';

/** Thought record drafts. In memory only: a reload or sign-out discards them, by design. */
export interface Draft {
  values: DraftValues;
  dirty: boolean;
}
export type DraftValues = Omit<JournalInput, 'intensityBefore'> & { intensityBefore: number };

const drafts = new Map<string, Draft>();

export const NEW_DRAFT = 'new';
export const getDraft = (key: string) => drafts.get(key);
export const setDraft = (key: string, draft: Draft) => void drafts.set(key, draft);
export const deleteDraft = (key: string) => void drafts.delete(key);
export const allDrafts = () => [...drafts.entries()];
export const clearDrafts = () => drafts.clear();
export const hasDirtyDraft = (key: string) => drafts.get(key)?.dirty === true;

export const emptyDraft = (): DraftValues => ({
  situation: '',
  thought: '',
  feelings: [],
  intensityBefore: 5,
  evidenceFor: '',
  evidenceAgainst: '',
  balancedThought: '',
  intensityAfter: null,
});
