import { describe, expect, test } from 'bun:test';
import { auditFields, exportedFields } from './field-audit';

describe('UI field audit', () => {
  test('reports unwired labels even when their dictionary entries exist', () => {
    const findings = auditFields(
      `const hint = () => ready ? 'Visible to your whole team' : 'Only you';
      const subtitle = 'Sending this link';
      const metadata = { github: { outcome: 'Answer questions about repos' } };
      const View = () => <><p>{hint()}</p><Button backLabel={subtitle} />
      <div>{metadata.github.outcome}</div></>;
      toast.success('Copied', { subtext: subtitle });
      const delivery = { actionLabel: () => 'Send email', get content() { return 'Calendar access'; } };`,
      'view.tsx',
      {
        'Visible to your whole team': '整个团队可见',
        'Send email': '发送邮件',
      }
    );
    expect(findings.map((item) => item.text)).toEqual(
      expect.arrayContaining([
        'Visible to your whole team',
        'Only you',
        'Sending this link',
        'Answer questions about repos',
        'Send email',
        'Calendar access',
        'Copied',
      ])
    );
    expect(findings.every((item) => item.kind === 'unwrapped')).toBe(true);
  });

  test('checks explicit constant keys, context fallback and interpolation', () => {
    const findings = auditFields(
      `const KEY = 'Hello {name}';
      const View = () => <><p>{t(KEY, { name: user.name })}</p>
      <p>{t('Owner', { context: 'crm' })}</p><p>{t('Unknown')}</p></>;`,
      'view.tsx',
      {
        'Hello {name}': '你好',
        'Owner@@crm': '负责人',
      }
    );
    expect(findings.map((item) => [item.text, item.kind])).toEqual([
      ['Hello {name}', 'interpolation-mismatch'],
      ['Unknown', 'missing-translation'],
    ]);
  });

  test('follows imported constants and accessor returns with original locations', () => {
    const exported = exportedFields(
      `export const hint = () => 'Connect calendar';`,
      'metadata.ts'
    );
    const findings = auditFields(
      `import { hint } from './metadata';
      const View = () => <p>{hint()}</p>;`,
      'view.tsx',
      {},
      () => exported.get('hint')
    );
    expect(findings[0]).toMatchObject({
      file: 'metadata.ts',
      text: 'Connect calendar',
      kind: 'unwrapped',
    });
  });

  test('covers DOM labels and CSS picker label variables', () => {
    const findings = auditFields(
      `el.setAttribute('aria-label', 'Font size');
      const style = { '--signature-default-size-label': JSON.stringify('Normal') };`,
      'editor.tsx',
      {}
    );
    expect(findings.map((item) => item.text)).toEqual(['Font size', 'Normal']);
  });

  test('ignores user data, enum outcomes, classes and translated composition', () => {
    expect(
      auditFields(
        `const state = { outcome: 'success', type: 'send' };
      const View = () => <div class="flex">{user.name}{user.signature}{\`\${t("Replying to")} \${user.name}\`}</div>;`,
        'view.tsx',
        { 'Replying to': '正在回复' }
      )
    ).toEqual([]);
  });

  test('does not recurse indefinitely through circular label aliases', () => {
    expect(
      auditFields(
        `const a = b; const b = a; const View = () => <p>{a}</p>;`,
        'view.tsx',
        {}
      )
    ).toEqual([]);
  });
});
