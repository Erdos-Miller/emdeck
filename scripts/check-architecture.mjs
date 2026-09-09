import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { budgets, fileBudget, forbiddenImport, sourceRoots } from './architecture-policy.mjs';

const files = sourceRoots.flatMap(root =>
  fs
    .readdirSync(root, { recursive: true })
    .map(file => `${root}/${file.replaceAll('\\', '/')}`)
    .filter(file => /\.(tsx?|mjs|rs|css)$/.test(file))
);
const failures = [];
const graph = new Map();
const mode = process.argv[2] ?? 'all';
const resolveImport = (from, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), specifier);
  const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`].find(
    file => fs.existsSync(file) && fs.statSync(file).isFile()
  );
  return resolved ? path.relative(process.cwd(), resolved).replaceAll('\\', '/') : null;
};

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.replace(/\n$/, '').split('\n').length;
  const budget = fileBudget(file);
  if (mode !== 'boundaries' && lines > budget.max)
    failures.push(`${file}: ${lines} lines exceeds ${budget.max}. Extract a cohesive module.`);
  if (mode === 'size') continue;
  if (file.startsWith('src-tauri/src/services/') && /crate::(?:commands|state)\b/.test(content))
    failures.push(`${file}: native services must not depend on command or window-state adapters.`);
  if (!/^src\/.*\.tsx?$/.test(file)) continue;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const edges = new Set();
  const visit = node => {
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : null;
    if (specifier && ts.isStringLiteral(specifier)) {
      const target = resolveImport(file, specifier.text);
      if (target) {
        edges.add(target);
        const reason = forbiddenImport(file, target);
        if (reason) failures.push(`${file} → ${target}: ${reason}`);
      } else if (
        (file.includes('/services/') || file.startsWith('src/shared/contracts/')) &&
        /^(react|react-dom|@tauri-apps|@tanstack\/react-query)(\/|$)/.test(specifier.text)
      ) {
        failures.push(`${file}: domain services and contracts cannot import ${specifier.text}.`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  graph.set(file, edges);
}

const visited = new Set();
const walk = (file, route) => {
  if (route.includes(file)) {
    failures.push(`Import cycle: ${[...route.slice(route.indexOf(file)), file].join(' → ')}`);
    return;
  }
  if (visited.has(file)) return;
  visited.add(file);
  for (const child of graph.get(file) ?? []) walk(child, [...route, file]);
};
for (const file of graph.keys()) walk(file, []);

if (mode !== 'size') {
  const contract = ts.createSourceFile(
    'desktop.ts',
    fs.readFileSync('src/shared/contracts/desktop.ts', 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const schema = contract.statements.find(
    node => ts.isInterfaceDeclaration(node) && node.name.text === 'DesktopCommands'
  );
  const frontend = schema.members.map(member => member.name.getText()).sort();
  const native = [
    ...fs.readFileSync('src-tauri/src/lib.rs', 'utf8').matchAll(/commands::\w+::(\w+)/g),
  ]
    .map(match => match[1])
    .sort();
  if (JSON.stringify(frontend) !== JSON.stringify(native))
    failures.push(
      'Desktop IPC contract differs from the registered Rust command list. Update both sides together.'
    );
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Architecture checks passed (${files.length} files; ${budgets.component.max}/${budgets.service.max}/${budgets.test.max} line limits, no exceptions).`
  );
}
