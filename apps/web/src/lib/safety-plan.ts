import { safetyPlanResponse, type SafetyPlan, type SafetyPlanSaved } from '@anxiocare/shared';
import { isNotFound, request } from './api';

export const planKey = ['safety-plan'] as const;

/** The saved plan, or null when this account hasn't saved one. */
export async function fetchPlan(): Promise<SafetyPlanSaved | null> {
  try {
    return await request('GET', '/safety-plan', { schema: safetyPlanResponse });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export const putPlan = (plan: SafetyPlan) => request('PUT', '/safety-plan', { body: plan, schema: safetyPlanResponse });

export async function deletePlan(): Promise<void> {
  try {
    await request('DELETE', '/safety-plan');
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

/** A number as typed, made dialable: keeps digits and a leading +. */
export const telHref = (phone: string) => `tel:${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}`;

/** Only the sections' own fields, with blank rows dropped, so that what is saved is what the person wrote. */
export function tidyPlan(plan: SafetyPlan): SafetyPlan {
  const list = (items: string[]) => items.map((i) => i.trim()).filter(Boolean);
  const contacts = (items: SafetyPlan['helpContacts']) =>
    items.map((c) => ({ name: c.name.trim(), phone: c.phone.trim() })).filter((c) => c.name || c.phone);
  return {
    warningSigns: list(plan.warningSigns),
    copingStrategies: list(plan.copingStrategies),
    distractions: list(plan.distractions),
    helpContacts: contacts(plan.helpContacts),
    professionals: contacts(plan.professionals),
    saferSurroundings: list(plan.saferSurroundings),
    reasonsToLive: list(plan.reasonsToLive),
  };
}
