import { execSync } from 'node:child_process';
import assert from 'node:assert';
import { describe, it } from 'node:test';

describe('unicorn/prevent-abbreviations', () => {
  it('should have zero violations', () => {
    let output;
    try {
      output = execSync('npx eslint . --format json 2>/dev/null', {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      // eslint exits non-zero when there are any errors — use stdout from the error
      output = error.stdout;
    }

    const data = JSON.parse(output);
    const violations = [];
    for (const file of data) {
      for (const message of file.messages) {
        if (message.ruleId === 'unicorn/prevent-abbreviations') {
          violations.push(
            `${file.filePath.replace(/.*addressr\//, '')}:${message.line} ${message.message}`,
          );
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found ${violations.length} prevent-abbreviations violations:\n${violations.join('\n')}`,
    );
  });
});
