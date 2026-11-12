import { AGE_RANGES, AVATARS, GENDERS, OCCUPATIONS, STRESS_FACTORS, type Profile } from '@anxiocare/shared';

const chip = 'chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-on-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus';

type Single = 'avatar' | 'ageRange' | 'gender' | 'occupation';

function Choices<K extends Single>({ field, legend, options, value, onChange, name }: {
  field: K;
  legend: string;
  options: readonly { id: NonNullable<Profile[K]>; label: string; emoji?: string }[];
  value: Profile;
  onChange: (next: Profile) => void;
  name: string;
}) {
  const current = value[field];
  const pick = (id: Profile[K] | undefined) => {
    const next = { ...value };
    if (id === undefined) delete next[field];
    else next[field] = id;
    onChange(next);
  };
  return (
    <fieldset role="radiogroup" className="flex flex-col gap-2">
      <legend className="font-display text-lg font-semibold">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        <label className={chip}>
          <input type="radio" name={name} className="sr-only" checked={current === undefined} onChange={() => pick(undefined)} />
          {field === 'avatar' ? 'Your initial' : 'Not set'}
        </label>
        {options.map((o) => (
          <label key={o.id} className={chip}>
            <input type="radio" name={name} className="sr-only" checked={current === o.id} onChange={() => pick(o.id)} />
            {o.emoji && <span aria-hidden="true" className="mr-1.5">{o.emoji}</span>}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The optional details, every one a fixed choice with large tap targets: the About you screen and Settings share it.
 * "Not set" (or "Your initial") clears a field.
 */
export function ProfileForm({ value, onChange, idPrefix }: { value: Profile; onChange: (next: Profile) => void; idPrefix: string }) {
  const factors = value.stressFactors ?? [];
  const toggle = (id: (typeof STRESS_FACTORS)[number]['id'], on: boolean) => {
    // Kept in the list's own order, whatever order they were tapped in.
    const chosen = STRESS_FACTORS.map((s) => s.id).filter((s) => (s === id ? on : factors.includes(s)));
    const next = { ...value };
    if (chosen.length) next.stressFactors = chosen;
    else delete next.stressFactors;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-5">
      <Choices field="avatar" legend="Avatar" name={`${idPrefix}-avatar`} options={AVATARS} value={value} onChange={onChange} />
      <Choices field="ageRange" legend="Age range" name={`${idPrefix}-age`} options={AGE_RANGES} value={value} onChange={onChange} />
      <Choices field="gender" legend="Gender" name={`${idPrefix}-gender`} options={GENDERS} value={value} onChange={onChange} />
      <Choices field="occupation" legend="What you do" name={`${idPrefix}-occupation`} options={OCCUPATIONS} value={value} onChange={onChange} />
      <fieldset className="flex flex-col gap-2">
        <legend className="font-display text-lg font-semibold">What tends to cause you stress?</legend>
        <p className="text-sm text-ink-soft">Choose any. We suggest tools that may help.</p>
        <div className="flex flex-wrap gap-2">
          {STRESS_FACTORS.map((s) => (
            <label key={s.id} className={chip}>
              <input type="checkbox" className="sr-only" checked={factors.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
