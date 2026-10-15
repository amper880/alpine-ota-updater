# Translating

UI texts live in `src/i18n/locales/<code>.json` — one flat JSON object per language.
English (`en.json`) is the reference and the fallback for missing keys.

## Adding a language

1. Copy `src/i18n/locales/en.json` to `<code>.json`, where `<code>` is the two-letter
   ISO 639-1 code (e.g. `de.json`).
2. Translate the values. Keep the keys and the `{placeholders}` unchanged.
3. Register it in `src/i18n/index.ts`:

   ```ts
   import de from './locales/de.json';
   // …
   export const LOCALES: LocaleInfo[] = [
     { code: 'en', name: 'English', messages: en as Messages },
     { code: 'hu', name: 'Magyar', messages: hu as Messages },
     { code: 'de', name: 'Deutsch', messages: de as Messages },
   ];
   ```

4. Run `npm test` — it checks that every locale has the same keys and placeholders as English.

## Plurals

Keys ending in `_one`, `_few`, `_many`, `_other` … are chosen with `Intl.PluralRules` when the
text has a `{count}` placeholder. Provide the forms your language needs; `_other` is always
required.

## Language selection

The app picks the first browser language it supports, otherwise English. The user's choice in
the header is remembered on the device.
