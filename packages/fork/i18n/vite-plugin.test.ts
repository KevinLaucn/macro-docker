import { describe, expect, test } from 'bun:test';
import { parse } from '@babel/parser';
import { i18nAstPlugin } from './vite-plugin';

async function transformed(source: string) {
  const hook = i18nAstPlugin().transform as (
    code: string,
    id: string
  ) => { code: string } | null;
  const result = await hook.call({}, source, '/apps/web/src/example.tsx');
  const code = result?.code ?? source;
  parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  return code;
}

describe('explicit and legacy translation imports', () => {
  test('adds legacy binding alongside explicit t during partial migration', async () => {
    const code = await transformed(
      `import { t } from '@macro/i18n'; const View = () => <div><p>{t('Save')}</p><p>Cancel</p></div>;`
    );
    expect(code).toContain('import { __t }');
    expect(code).toContain("t('Save')");
    expect(code).toContain('__t("Cancel")');
  });
  test('keeps an existing legacy binding without duplicating it', async () => {
    const code = await transformed(
      `import { __t } from '@macro/i18n'; const View = () => <div>Cancel</div>;`
    );
    expect(code.match(/import \{ __t \}/g)?.length).toBe(1);
  });
  test('comments and aliased imports do not suppress the required binding', async () => {
    const code = await transformed(
      `// @macro/i18n\nimport { __t as legacy } from '@macro/i18n'; const View = () => <div>Cancel</div>;`
    );
    expect(code).toContain('import { __t }');
  });
});
