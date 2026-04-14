import { execSync } from 'node:child_process';
import assert from 'node:assert';
import { describe, it } from 'node:test';

describe('eslint', () => {
  it('should have zero errors', () => {
    let output;
    try {
      output = execSync('npx eslint . --format json 2>/dev/null', {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      output = error.stdout;
    }

    const data = JSON.parse(output);
    const errors = [];
    for (const file of data) {
      for (const message of file.messages) {
        if (message.severity === 2) {
          errors.push(
            `${file.filePath.replace(/.*addressr\//, '')}:${message.line} [${message.ruleId}] ${message.message}`,
          );
        }
      }
    }

    assert.strictEqual(
      errors.length,
      0,
      `Found ${errors.length} ESLint errors:\n${errors.join('\n')}`,
    );
  });
});
