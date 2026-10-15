/**
 * Tiny observable store. Components subscribe with a selector and are only notified when the
 * selected value changes (shallow comparison of arrays/objects one level deep).
 */
export type Listener<T> = (state: T, prev: T) => void;

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: Listener<T>): () => void;
  select<S>(selector: (s: T) => S, onChange: (value: S) => void): () => void;
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      for (const l of [...listeners]) l(state, prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    select(selector, onChange) {
      let current = selector(state);
      onChange(current);
      return this.subscribe((s) => {
        const next = selector(s);
        if (!shallowEqual(next, current)) {
          current = next;
          onChange(next);
        }
      });
    },
  };
}
