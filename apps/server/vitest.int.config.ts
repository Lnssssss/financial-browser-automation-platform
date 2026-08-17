import { defineConfig } from 'vitest/config';

// 集成测试：连真实 MySQL（docker compose 的 agentflow-mysql）。
// 与单元测试分开跑：pnpm test 只跑纯逻辑 .spec.ts；这个要 DB 在线。
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.int-spec.ts'],
    testTimeout: 20000,
    fileParallelism: false, // 共享 DB，串行避免相互干扰
  },
});
