#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const ROUTE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const ALLOWED_CONTROL_RESPONSE_KEYS = new Set(['ok', 'success', 'error', 'code', 'message']);

const toPos = (sourceFile, node) => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: line + 1,
    column: character + 1,
  };
};

const isPrimitiveLiteral = (node) =>
  ts.isStringLiteralLike(node) ||
  ts.isNumericLiteral(node) ||
  node.kind === ts.SyntaxKind.TrueKeyword ||
  node.kind === ts.SyntaxKind.FalseKeyword ||
  node.kind === ts.SyntaxKind.NullKeyword;

const isFixtureString = (value) => /mock|fixture|sample|demo|conv_|wamid|user_/i.test(value);

const analyzeLiteral = (node) => {
  if (isPrimitiveLiteral(node)) {
    const fixtureHit = ts.isStringLiteralLike(node) ? isFixtureString(node.text) : false;
    return {
      isPureLiteral: true,
      hasNestedStructure: false,
      hasFixtureToken: fixtureHit,
    };
  }

  if (ts.isArrayLiteralExpression(node)) {
    let hasFixtureToken = false;
    for (const element of node.elements) {
      const analysis = analyzeLiteral(element);
      if (!analysis.isPureLiteral) {
        return {
          isPureLiteral: false,
          hasNestedStructure: true,
          hasFixtureToken: hasFixtureToken || analysis.hasFixtureToken,
        };
      }
      hasFixtureToken = hasFixtureToken || analysis.hasFixtureToken;
    }

    return {
      isPureLiteral: true,
      hasNestedStructure: true,
      hasFixtureToken,
    };
  }

  if (ts.isObjectLiteralExpression(node)) {
    const objectAnalysis = analyzeObjectLiteral(node);
    return {
      isPureLiteral: objectAnalysis.isPureLiteral,
      hasNestedStructure: true,
      hasFixtureToken: objectAnalysis.hasFixtureToken,
    };
  }

  return {
    isPureLiteral: false,
    hasNestedStructure: false,
    hasFixtureToken: false,
  };
};

const analyzeObjectLiteral = (objectLiteral) => {
  let isPureLiteral = true;
  let hasNestedStructure = false;
  let hasFixtureToken = false;
  const keys = [];

  for (const property of objectLiteral.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      isPureLiteral = false;
      continue;
    }

    if (ts.isSpreadAssignment(property)) {
      isPureLiteral = false;
      continue;
    }

    if (!ts.isPropertyAssignment(property)) {
      isPureLiteral = false;
      continue;
    }

    const propertyName = ts.isIdentifier(property.name)
      ? property.name.text
      : ts.isStringLiteralLike(property.name)
        ? property.name.text
        : null;

    if (propertyName) {
      keys.push(propertyName);
      hasFixtureToken = hasFixtureToken || isFixtureString(propertyName);
    }

    const analysis = analyzeLiteral(property.initializer);
    if (!analysis.isPureLiteral) {
      isPureLiteral = false;
    }
    hasNestedStructure = hasNestedStructure || analysis.hasNestedStructure;
    hasFixtureToken = hasFixtureToken || analysis.hasFixtureToken;
  }

  return {
    isPureLiteral,
    hasNestedStructure,
    hasFixtureToken,
    keys,
  };
};

const looksLikeHardcodedFixturePayload = (node) => {
  if (ts.isArrayLiteralExpression(node)) {
    const analysis = analyzeLiteral(node);
    return analysis.isPureLiteral;
  }

  if (!ts.isObjectLiteralExpression(node)) {
    return false;
  }

  const analysis = analyzeObjectLiteral(node);
  if (!analysis.isPureLiteral) {
    return false;
  }

  const hasOnlyControlKeys =
    analysis.keys.length > 0 &&
    analysis.keys.every((key) => ALLOWED_CONTROL_RESPONSE_KEYS.has(key));

  if (hasOnlyControlKeys && analysis.keys.length <= 2) {
    return false;
  }

  if (analysis.hasFixtureToken) {
    return true;
  }

  if (analysis.hasNestedStructure) {
    return true;
  }

  return analysis.keys.some((key) => !ALLOWED_CONTROL_RESPONSE_KEYS.has(key));
};

const isRouteFile = (filePath) => {
  if (filePath.includes(`${path.sep}dist${path.sep}`)) {
    return false;
  }

  const extension = path.extname(filePath);
  if (!ROUTE_EXTENSIONS.has(extension)) {
    return false;
  }

  return filePath.includes(`${path.sep}src${path.sep}routes${path.sep}`);
};

const collectFiles = async (rootDir) => {
  const output = [];

  const walk = async (currentDir) => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (isRouteFile(fullPath)) {
        output.push(fullPath);
      }
    }
  };

  await walk(rootDir);
  return output;
};

const createViolation = (sourceFile, node, message) => {
  const position = toPos(sourceFile, node);
  return {
    file: sourceFile.fileName,
    line: position.line,
    column: position.column,
    message,
  };
};

const checkRouteFile = async (filePath) => {
  const source = await fs.readFile(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const violations = [];

  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      node.moduleSpecifier.text.toLowerCase().includes('mock')
    ) {
      violations.push(
        createViolation(sourceFile, node, "Route imports a module path containing 'mock'"),
      );
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      if ((methodName === 'json' || methodName === 'send') && node.arguments.length > 0) {
        const firstArgument = node.arguments[0];
        if (looksLikeHardcodedFixturePayload(firstArgument)) {
          violations.push(
            createViolation(
              sourceFile,
              firstArgument,
              `Route handler returns hardcoded fixture payload via res.${methodName}(...)`,
            ),
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
};

const main = async () => {
  const root = process.cwd();
  const appsDir = path.join(root, 'apps');
  const files = await collectFiles(appsDir);
  const violations = [];

  for (const filePath of files) {
    const fileViolations = await checkRouteFile(filePath);
    violations.push(...fileViolations);
  }

  if (violations.length === 0) {
    console.log('Route guard passed: no mock imports or hardcoded fixture payloads in routes.');
    return;
  }

  console.error('Route guard failed: production route constraints violated.');
  for (const violation of violations) {
    const relativePath = path.relative(root, violation.file);
    console.error(`- ${relativePath}:${violation.line}:${violation.column} ${violation.message}`);
  }
  process.exit(1);
};

void main();
