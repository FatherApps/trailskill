import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as ts from 'typescript';

// The results-import Edge Function imports catalogs.ts and the deploy bundle ships only that file
// (deploy/README.md, "Edge Functions"). A single import in it would break the function in Deno.
function moduleReferences(source: string): string[] {
  const file = ts.createSourceFile('catalogs.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const isLoad =
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'));
    if (
      ts.isImportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      ts.isImportTypeNode(node) ||
      (ts.isExportDeclaration(node) && node.moduleSpecifier) ||
      isLoad
    ) {
      found.push(node.getText(file));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('catalogs.ts stays free of imports', () => {
  it('has no import, re-export or require', () => {
    const source = readFileSync(join(__dirname, '..', 'catalogs.ts'), 'utf8');
    expect(moduleReferences(source)).toEqual([]);
  });

  it.each([
    ["import { x } from './other';"],
    ["import type { X } from './other';"],
    ["import './side-effect';"],
    ["export * from './other';"],
    ["export { x } from './other';"],
    ["import x = require('./other');"],
    ["const x = require('./other');"],
    ["const x = import('./other');"],
    ["export const x: import('./other').X = 1;"],
  ])('detects %s', (code) => {
    expect(moduleReferences(code)).toHaveLength(1);
  });

  it('ignores the word import in comments and strings', () => {
    expect(moduleReferences("// import { x } from './other';\nexport const note = \"import from here\";")).toEqual([]);
  });
});
