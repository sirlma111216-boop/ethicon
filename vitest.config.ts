import { defineConfig } from 'vitest/config';

// 단위 테스트는 순수 모듈만 대상으로 하므로 Cloudflare 플러그인 없이 실행한다.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
