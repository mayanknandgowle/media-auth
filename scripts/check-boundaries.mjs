import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : path.join(directory, entry.name),
      ),
    )
  ).flat();
}
const allowed = {
  core: new Set(),
  media: new Set(['@media-auth/core']),
  analyzers: new Set(['@media-auth/core']),
};
for (const [name, dependencies] of Object.entries(allowed)) {
  const sourceRoot = path.resolve(`packages/${name}/src`);
  for (const file of await files(sourceRoot)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = ts.createSourceFile(
      file,
      await readFile(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function check(specifier) {
      if (!specifier || !ts.isStringLiteralLike(specifier))
        throw new Error(`Nonliteral module import in ${file}`);
      const value = specifier.text;
      if (value.startsWith('.')) {
        const target = path.resolve(path.dirname(file), value);
        if (!target.startsWith(`${sourceRoot}${path.sep}`))
          throw new Error(`Cross-package relative import in ${file}`);
        return;
      }
      if (dependencies.has(value)) return;
      if (name === 'analyzers' && path.basename(file) === 'node.ts' && value === 'node:crypto')
        return;
      throw new Error(`Forbidden dependency ${value} in ${file}`);
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) check(node.moduleSpecifier);
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) check(node.moduleSpecifier);
      if (ts.isImportEqualsDeclaration(node)) {
        if (!ts.isExternalModuleReference(node.moduleReference))
          throw new Error(`Unsupported import alias in ${file}`);
        check(node.moduleReference.expression);
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        check(node.argument.literal);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      )
        check(node.arguments[0]);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
console.log(
  'Package dependency boundaries passed. Core also typechecks without DOM or Node globals.',
);
