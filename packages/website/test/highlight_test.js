import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  createZenaHighlighter,
  extractDiagnostics,
  renderCodeBlock,
} from '../lib/highlight.js';

describe('extractDiagnostics', () => {
  it('extracts single caret error and expands word token', () => {
    const input = [
      'let n: i32 = 42;',
      'let x: f64 = n;',
      '//           ^ error: i32 is not assignable to f64',
    ].join('\n');

    const result = extractDiagnostics(input);
    assert.equal(result.cleanedCode, 'let n: i32 = 42;\nlet x: f64 = n;');
    assert.equal(result.diagnostics.length, 1);
    assert.deepEqual(result.diagnostics[0], {
      lineIndex: 1,
      startCol: 13,
      endCol: 14,
      severity: 'error',
      message: 'i32 is not assignable to f64',
    });
  });

  it('extracts multi-caret span accurately', () => {
    const input = [
      'let x: f64 = "hello";',
      '//           ^^^^^^^ error: String is not assignable to f64',
    ].join('\n');

    const result = extractDiagnostics(input);
    assert.equal(result.cleanedCode, 'let x: f64 = "hello";');
    assert.equal(result.diagnostics.length, 1);
    assert.deepEqual(result.diagnostics[0], {
      lineIndex: 0,
      startCol: 13,
      endCol: 20,
      severity: 'error',
      message: 'String is not assignable to f64',
    });
  });

  it('targets column 0 when carets start immediately at //^^^', () => {
    const input = ['const x = 1;', '//^^^ error: const is not supported'].join(
      '\n',
    );

    const result = extractDiagnostics(input);
    assert.equal(result.cleanedCode, 'const x = 1;');
    assert.equal(result.diagnostics.length, 1);
    assert.deepEqual(result.diagnostics[0], {
      lineIndex: 0,
      startCol: 0,
      endCol: 5,
      severity: 'error',
      message: 'const is not supported',
    });
  });

  it('supports token targeting syntax // @error("token"): message', () => {
    const input = [
      'const x = 1;',
      '// @error("const"): const is not supported',
    ].join('\n');

    const result = extractDiagnostics(input);
    assert.equal(result.cleanedCode, 'const x = 1;');
    assert.equal(result.diagnostics.length, 1);
    assert.deepEqual(result.diagnostics[0], {
      lineIndex: 0,
      startCol: 0,
      endCol: 5,
      severity: 'error',
      message: 'const is not supported',
    });
  });

  it('supports token targeting for warnings // @warning("token"): message', () => {
    const input = ['let x = 1;', '// @warning("x"): unused variable'].join(
      '\n',
    );

    const result = extractDiagnostics(input);
    assert.equal(result.cleanedCode, 'let x = 1;');
    assert.equal(result.diagnostics.length, 1);
    assert.deepEqual(result.diagnostics[0], {
      lineIndex: 0,
      startCol: 4,
      endCol: 5,
      severity: 'warning',
      message: 'unused variable',
    });
  });

  it('supports same-line directives // @error: message', () => {
    const input = [
      'let x = 1;',
      'let bad = t[5]; // @error: index out of bounds',
      'let y = 2;',
    ].join('\n');

    const result = extractDiagnostics(input);
    assert.equal(result.cleanedCode, 'let x = 1;\nlet bad = t[5];\nlet y = 2;');
    assert.equal(result.diagnostics.length, 1);
    assert.deepEqual(result.diagnostics[0], {
      lineIndex: 1,
      startCol: 0,
      endCol: 15,
      severity: 'error',
      message: 'index out of bounds',
    });
  });

  it('skips leading indentation when targeting whole line with // @error: message', () => {
    const input = [
      'function test(): void {',
      '  tail return count() + 1;',
      '  // @error: tail return returns a call',
      '}',
    ].join('\n');

    const result = extractDiagnostics(input);
    assert.equal(result.diagnostics.length, 1);
    assert.deepEqual(result.diagnostics[0], {
      lineIndex: 1,
      startCol: 2,
      endCol: 26,
      severity: 'error',
      message: 'tail return returns a call',
    });
  });

  it('skips leading indentation for same-line directive on indented line', () => {
    const input = ['  let bad = t[5]; // @error: index out of bounds'].join(
      '\n',
    );

    const result = extractDiagnostics(input);
    assert.equal(result.diagnostics.length, 1);
    assert.deepEqual(result.diagnostics[0], {
      lineIndex: 0,
      startCol: 2,
      endCol: 17,
      severity: 'error',
      message: 'index out of bounds',
    });
  });

  it('supports warning severity in caret lines', () => {
    const input = ['let x = 42;', '//  ^ warning: unused variable x'].join(
      '\n',
    );

    const result = extractDiagnostics(input);
    assert.equal(result.cleanedCode, 'let x = 42;');
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].severity, 'warning');
    assert.equal(result.diagnostics[0].message, 'unused variable x');
  });

  it('defaults to error when no severity is specified', () => {
    const input = ['let x: f64 = n;', '//           ^ type mismatch'].join(
      '\n',
    );

    const result = extractDiagnostics(input);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].severity, 'error');
    assert.equal(result.diagnostics[0].message, 'type mismatch');
  });

  it('handles multiple carets on the same code line', () => {
    const input = [
      'let x = a + b;',
      '//      ^ error: cannot find a',
      '//          ^ error: cannot find b',
    ].join('\n');

    const result = extractDiagnostics(input);
    assert.equal(result.cleanedCode, 'let x = a + b;');
    assert.equal(result.diagnostics.length, 2);
    assert.equal(result.diagnostics[0].startCol, 8);
    assert.equal(result.diagnostics[0].endCol, 9);
    assert.equal(result.diagnostics[1].startCol, 12);
    assert.equal(result.diagnostics[1].endCol, 13);
  });

  it('preserves code without diagnostics unchanged', () => {
    const input = 'let x = 42;\n// Normal comment\nlet y = 10;';
    const result = extractDiagnostics(input);
    assert.equal(result.cleanedCode, input);
    assert.equal(result.diagnostics.length, 0);
  });
});

describe('renderCodeBlock with diagnostics', () => {
  it('renders squiggles and error callouts in HTML', async () => {
    const highlighter = await createZenaHighlighter();
    const input = [
      'let n: i32 = 42;',
      'let x: f64 = n;',
      '//           ^ error: i32 is not assignable to f64',
    ].join('\n');

    const html = renderCodeBlock(highlighter, input, 'zena');

    // Squiggle span
    assert.ok(
      html.includes('class="code-error-span"'),
      'Contains code-error-span',
    );
    assert.ok(html.includes('>n</span>'), 'Underlines n');

    // Error callout
    assert.ok(
      html.includes('code-diagnostic code-diagnostic-error'),
      'Contains diagnostic container',
    );
    assert.ok(html.includes('Error:'), 'Contains Error: label');
    assert.ok(
      html.includes('i32 is not assignable to f64'),
      'Contains error message',
    );

    // Comment line is stripped
    assert.ok(!html.includes('//           ^'), 'Caret comment line stripped');
  });

  it('renders warning squiggles and warning callouts in HTML', async () => {
    const highlighter = await createZenaHighlighter();
    const input = ['let x = 42;', '//  ^ warning: unused variable x'].join(
      '\n',
    );

    const html = renderCodeBlock(highlighter, input, 'zena');

    assert.ok(
      html.includes('class="code-warning-span"'),
      'Contains code-warning-span',
    );
    assert.ok(
      html.includes('code-diagnostic code-diagnostic-warning'),
      'Contains warning container',
    );
    assert.ok(html.includes('Warning:'), 'Contains Warning: label');
    assert.ok(html.includes('unused variable x'), 'Contains warning message');
  });
});
