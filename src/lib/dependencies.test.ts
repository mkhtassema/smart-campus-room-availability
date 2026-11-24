import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe('forbidden dependencies', () => {
  it('"@supabase/supabase-js" is not in dependencies', () => {
    expect(pkg.dependencies).not.toHaveProperty('@supabase/supabase-js');
  });

  it('"@supabase/supabase-js" is not in devDependencies', () => {
    expect(pkg.devDependencies).not.toHaveProperty('@supabase/supabase-js');
  });
});
