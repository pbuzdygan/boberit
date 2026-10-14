import { json, PublicError } from './http.js';

/**
 * Small validators for JSON bodies at the route boundary: types, lengths, calendar dates, and
 * allowed values. They never rewrite valid input, except that `null` in an optional text field
 * becomes `''`, which the data layer stores as "empty" exactly like `null`. Business rules (such
 * as a required non-blank name) stay in the data layer with their specific messages.
 */
export type Rule<T> = (value: unknown) => T;

const invalid = (label: string) => new PublicError(`Nieprawidłowa wartość pola „${label}”.`);
const missing = (label: string) => new PublicError(`Pole „${label}” jest wymagane.`);

export function text(label: string, max: number): Rule<string | undefined> {
  return (value) => {
    if (value === undefined) return undefined;
    if (value === null) return '';
    if (typeof value !== 'string') throw invalid(label);
    if (value.length > max) throw new PublicError(`Pole „${label}” może mieć najwyżej ${max} znaków.`);
    return value;
  };
}

export function requiredText(label: string, max: number): Rule<string> {
  const optional = text(label, max);
  return (value) => {
    if (value === undefined || value === null) throw missing(label);
    return optional(value)!;
  };
}

/** True for an existing calendar date written as YYYY-MM-DD. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/** An optional date; empty values are allowed and mean "no date". */
export function date(label: string): Rule<string | undefined> {
  return (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return '';
    if (typeof value !== 'string' || !isCalendarDate(value)) throw invalid(label);
    return value;
  };
}

export function integer(label: string, min: number, max: number): Rule<number | null | undefined> {
  return (value) => {
    if (value === undefined || value === null) return value;
    if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw invalid(label);
    return value as number;
  };
}

export function number(label: string, min: number, max: number): Rule<number | undefined> {
  return (value) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw invalid(label);
    return value;
  };
}

/**
 * One of `values`. With `emptyAllowed`, `null` and `''` mean "not set" and are dropped, which the
 * data layer already treats like an absent field (default or current value).
 */
export function oneOf<T extends string>(
  label: string,
  values: readonly T[],
  emptyAllowed = false,
): Rule<T | undefined> {
  return (value) => {
    if (value === undefined) return undefined;
    if (emptyAllowed && (value === null || value === '')) return undefined;
    if (typeof value !== 'string' || !values.includes(value as T)) throw invalid(label);
    return value as T;
  };
}

export function required<T>(label: string, rule: Rule<T | undefined>): Rule<T> {
  return (value) => {
    if (value === undefined || value === null) throw missing(label);
    return rule(value) as T;
  };
}

export function textList(label: string, maxItems: number, maxLength: number): Rule<string[] | undefined> {
  return (value) => {
    if (value === undefined) return undefined;
    if (
      !Array.isArray(value) ||
      value.length > maxItems ||
      !value.every((entry) => typeof entry === 'string' && entry.length <= maxLength)
    )
      throw invalid(label);
    return value as string[];
  };
}

type Shape = Record<string, Rule<unknown>>;
type Parsed<S extends Shape> = {
  [K in keyof S as undefined extends ReturnType<S[K]> ? never : K]: ReturnType<S[K]>;
} & {
  [K in keyof S as undefined extends ReturnType<S[K]> ? K : never]?: Exclude<ReturnType<S[K]>, undefined>;
};

/** A plain object with the given fields; unknown fields are dropped and absent fields stay absent. */
export function shape<S extends Shape>(fields: S): Rule<Parsed<S>> {
  return (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new PublicError('Nieprawidłowe dane żądania.');
    const result: Record<string, unknown> = {};
    for (const [key, rule] of Object.entries(fields)) {
      const parsed = rule((value as Record<string, unknown>)[key]);
      if (parsed !== undefined) result[key] = parsed;
    }
    return result as Parsed<S>;
  };
}

export async function readBody<T>(request: Request, rule: Rule<T>): Promise<T> {
  return rule(await json<unknown>(request));
}
