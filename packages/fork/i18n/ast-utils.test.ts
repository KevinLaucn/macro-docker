import { describe, expect, test } from 'bun:test';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { isUiFallbackStringLiteral } from './ast-utils';

const traverse = (traverseModule as any).default || traverseModule;

function findFallbacks(source: string): string[] {
  const values: string[] = [];
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  traverse(ast, {
    StringLiteral(path: any) {
      if (isUiFallbackStringLiteral(path)) values.push(path.node.value);
    },
  });

  return values;
}

describe('i18n UI fallback detection', () => {
  test('finds logical fallbacks inside JSX expressions', () => {
    expect(
      findFallbacks(
        "const label = props.label; export const View = () => <EmptyState documentationLabel={label ?? 'Documentation'} />;"
      )
    ).toEqual(['Documentation']);
  });

  test('finds conditional fallback branches inside JSX expressions', () => {
    expect(
      findFallbacks(
        "export const View = (ready: boolean) => <EmptyState label={ready ? 'Ready' : 'Not ready'} />;"
      )
    ).toEqual(['Ready', 'Not ready']);
  });

  test('does not classify non-UI data defaults as copy', () => {
    expect(
      findFallbacks("const value = config.value ?? 'internal-default';")
    ).toEqual([]);
  });

  test('does not classify CSS class fallbacks as copy', () => {
    expect(
      findFallbacks(
        "export const View = (wide: boolean) => <div className={wide ? 'max-w-3xl' : 'max-w-md'} />;"
      )
    ).toEqual([]);
  });
});

import {
  extractLiteralString,
  getExportedConstants,
  resolveModulePath,
} from './ast-utils';
import path from 'node:path';

describe('i18n AST symbol resolution', () => {
  test('extractLiteralString extracts string and single quasi template literals', () => {
    expect(
      extractLiteralString({ type: 'StringLiteral', value: 'Hello' })
    ).toBe('Hello');
    expect(
      extractLiteralString({
        type: 'TemplateLiteral',
        quasis: [{ value: { raw: 'World' } }],
        expressions: [],
      })
    ).toBe('World');
  });

  test('resolveModulePath resolves relative and alias imports', () => {
    const webSrcDir = path.resolve(__dirname, '../../../apps/web/src');
    const tabListsPath = path.resolve(
      webSrcDir,
      'features/next-soup/soup-view/tab-lists.ts'
    );
    const resolved = resolveModulePath('./tab-lists', tabListsPath, webSrcDir);
    expect(resolved).toBe(tabListsPath);
  });
});

