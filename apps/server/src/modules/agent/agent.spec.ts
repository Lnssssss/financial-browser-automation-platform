import { describe, it, expect } from 'vitest';
import {
  CoordinationStatus,
  FailureStrategy,
  SubTask,
  SubTaskStatus,
  TaskPlan,
} from './schemas';
import { PlannerService } from './planner.service';
import { ExecutorService, HandlerResult } from './executor.service';
import { CoordinatorService } from './coordinator.service';

// 逐条翻译自源项目 tests/unit/test_agent.py。
// 作为 agent 模块的行为对齐基准：这些用例全绿 = TS 版行为与 Python 版一致。

// ============================================================
// Schema tests
// ============================================================

describe('SubTask', () => {
  it('default values', () => {
    const st = new SubTask({
      index: 0,
      goal: 'Login',
      completion_condition: 'URL has /home',
    });
    expect(st.status).toBe(SubTaskStatus.PENDING);
    expect(st.max_retries).toBe(2);
    expect(st.failure_strategy).toBe(FailureStrategy.REPLAN);
    expect(st.subtask_id.startsWith('sub_')).toBe(true);
  });

  it('custom failure strategy', () => {
    const st = new SubTask({
      index: 0,
      goal: 'Login',
      completion_condition: '',
      failure_strategy: FailureStrategy.ABORT,
    });
    expect(st.failure_strategy).toBe(FailureStrategy.ABORT);
  });
});

describe('TaskPlan', () => {
  it('plan creation', () => {
    const plan = new TaskPlan({
      navigation_goal: 'Download statements',
      subtasks: [
        new SubTask({ index: 0, goal: 'Login', completion_condition: '' }),
        new SubTask({ index: 1, goal: 'Navigate', completion_condition: '' }),
      ],
    });
    expect(plan.subtasks.length).toBe(2);
    expect(plan.is_replan).toBe(false);
    expect(plan.version).toBe(1);
    expect(plan.plan_id.startsWith('plan_')).toBe(true);
  });

  it('replan metadata', () => {
    const plan = new TaskPlan({
      navigation_goal: 'Download statements',
      subtasks: [new SubTask({ index: 1, goal: 'Retry nav', completion_condition: '' })],
      is_replan: true,
      replan_reason: 'Navigation button not found',
      version: 2,
    });
    expect(plan.is_replan).toBe(true);
    expect(plan.replan_reason).toBe('Navigation button not found');
  });
});

// ============================================================
// PlannerService tests
// ============================================================

describe('PlannerService', () => {
  it('fallback plan without llm', async () => {
    const planner = new PlannerService(null);
    const plan = await planner.createPlan('Download bank statements');
    expect(plan.subtasks.length).toBe(1);
    expect(plan.subtasks[0].goal).toBe('Download bank statements');
    expect(plan.subtasks[0].failure_strategy).toBe(FailureStrategy.ABORT);
  });

  it('plan with llm', async () => {
    const llmResponse = JSON.stringify({
      steps: [
        { goal: 'Login to e-banking', completion_condition: 'URL has /home', failure_strategy: 'abort', max_retries: 3 },
        { goal: 'Navigate to statements', completion_condition: 'Page has statement table', failure_strategy: 'replan' },
        { goal: 'Download CSV file', completion_condition: 'File downloaded', failure_strategy: 'retry' },
      ],
    });
    const planner = new PlannerService(async () => llmResponse);
    const plan = await planner.createPlan('Download bank statements for Q1 2026');
    expect(plan.subtasks.length).toBe(3);
    expect(plan.subtasks[0].goal).toBe('Login to e-banking');
    expect(plan.subtasks[0].failure_strategy).toBe(FailureStrategy.ABORT);
    expect(plan.subtasks[0].max_retries).toBe(3);
    expect(plan.subtasks[1].failure_strategy).toBe(FailureStrategy.REPLAN);
    expect(plan.subtasks[2].failure_strategy).toBe(FailureStrategy.RETRY);
  });

  it('plan with llm markdown wrapped', async () => {
    const llmResponse =
      '```json\n' +
      JSON.stringify({ steps: [{ goal: 'Do something', completion_condition: 'Done' }] }) +
      '\n```';
    const planner = new PlannerService(async () => llmResponse);
    const plan = await planner.createPlan('Test goal');
    expect(plan.subtasks.length).toBe(1);
  });

  it('plan llm failure falls back', async () => {
    const planner = new PlannerService(async () => {
      throw new Error('LLM service unavailable');
    });
    const plan = await planner.createPlan('Test goal');
    // 应回退到单步计划
    expect(plan.subtasks.length).toBe(1);
  });

  it('replan with llm', async () => {
    const replanResponse = JSON.stringify({
      steps: [
        { goal: 'Try alternative navigation', completion_condition: 'Page found', failure_strategy: 'abort' },
        { goal: 'Download file', completion_condition: 'File saved', failure_strategy: 'retry' },
      ],
    });
    const planner = new PlannerService(async () => replanResponse);
    const completed = [
      new SubTask({ index: 0, goal: 'Login', completion_condition: 'Done', status: SubTaskStatus.COMPLETED }),
    ];
    const failed = new SubTask({ index: 1, goal: 'Navigate to page', completion_condition: 'Page shown' });
    failed.status = SubTaskStatus.FAILED;

    const plan = await planner.replan(
      'Download statements',
      completed,
      failed,
      'Button not found on page',
    );
    expect(plan.is_replan).toBe(true);
    expect(plan.subtasks.length).toBe(2);
    expect(plan.subtasks[0].index).toBe(1); // 从上次中断处继续
  });

  it('replan without llm', async () => {
    const planner = new PlannerService(null);
    const completed = [new SubTask({ index: 0, goal: 'Login', completion_condition: '' })];
    const failed = new SubTask({ index: 1, goal: 'Navigate', completion_condition: '' });

    const plan = await planner.replan('Test goal', completed, failed, 'Something went wrong');
    expect(plan.is_replan).toBe(true);
    expect(plan.replan_reason).toBe('Something went wrong');
  });
});

// ============================================================
// ExecutorService tests
// ============================================================

describe('ExecutorService', () => {
  it('execute with simulation', async () => {
    const executor = new ExecutorService(null);
    const subtask = new SubTask({ index: 0, goal: 'Login', completion_condition: '' });

    const result = await executor.executeSubtask(subtask);
    expect(result.success).toBe(true);
    expect(subtask.status).toBe(SubTaskStatus.COMPLETED);
    expect(subtask.completed_at).not.toBeNull();
  });

  it('execute with handler success', async () => {
    const handler = async (): Promise<HandlerResult> => ({ success: true, data: { page: 'dashboard' } });
    const executor = new ExecutorService(handler);
    const subtask = new SubTask({ index: 0, goal: 'Login', completion_condition: '', max_retries: 1 });

    const result = await executor.executeSubtask(subtask);
    expect(result.success).toBe(true);
    expect((result.result_data as { page: string }).page).toBe('dashboard');
  });

  it('execute with handler failure', async () => {
    const handler = async (): Promise<HandlerResult> => ({ success: false, error: 'Element not found' });
    const executor = new ExecutorService(handler);
    const subtask = new SubTask({ index: 0, goal: 'Click button', completion_condition: '', max_retries: 1 });

    const result = await executor.executeSubtask(subtask);
    expect(result.success).toBe(false);
    expect(result.error_message).toBe('Element not found');
    expect(subtask.status).toBe(SubTaskStatus.FAILED);
  });

  it('execute retries then succeeds', async () => {
    let callCount = 0;
    const handler = async (): Promise<HandlerResult> => {
      callCount += 1;
      if (callCount < 2) return { success: false, error: 'Timeout' };
      return { success: true, data: { attempt: callCount } };
    };
    const executor = new ExecutorService(handler);
    const subtask = new SubTask({ index: 0, goal: 'Load page', completion_condition: '', max_retries: 2 });

    const result = await executor.executeSubtask(subtask);
    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });

  it('execute retries exhausted', async () => {
    const handler = async (): Promise<HandlerResult> => ({ success: false, error: 'Always fails' });
    const executor = new ExecutorService(handler);
    const subtask = new SubTask({ index: 0, goal: 'Broken step', completion_condition: '', max_retries: 2 });

    const result = await executor.executeSubtask(subtask);
    expect(result.success).toBe(false);
    expect(subtask.status).toBe(SubTaskStatus.FAILED);
  });

  it('execute exception handling', async () => {
    const handler = async (): Promise<HandlerResult> => {
      throw new Error('Network down');
    };
    const executor = new ExecutorService(handler);
    const subtask = new SubTask({ index: 0, goal: 'Fetch data', completion_condition: '', max_retries: 0 });

    const result = await executor.executeSubtask(subtask);
    expect(result.success).toBe(false);
    expect(result.error_message).toContain('Network down');
  });
});

// ============================================================
// CoordinatorService tests
// ============================================================

describe('Coordinator basic', () => {
  it('successful 3 step flow', async () => {
    const llmResponse = JSON.stringify({
      steps: [
        { goal: 'Login', completion_condition: 'Logged in', failure_strategy: 'abort' },
        { goal: 'Navigate to statements', completion_condition: 'Table visible', failure_strategy: 'replan' },
        { goal: 'Download CSV', completion_condition: 'File saved', failure_strategy: 'retry' },
      ],
    });
    const planner = new PlannerService(async () => llmResponse);
    const executor = new ExecutorService(async (goal) => ({ success: true, data: { goal } }));
    const coordinator = new CoordinatorService(planner, executor);

    const state = await coordinator.run('task_001', 'org_001', 'Download bank statements');
    expect(state.status).toBe(CoordinationStatus.COMPLETED);
    expect(state.completed_subtasks.length).toBe(3);
  });

  it('abort on first step failure', async () => {
    const llmResponse = JSON.stringify({
      steps: [
        { goal: 'Login', completion_condition: '', failure_strategy: 'abort', max_retries: 0 },
        { goal: 'Navigate', completion_condition: '', failure_strategy: 'replan' },
      ],
    });
    const planner = new PlannerService(async () => llmResponse);
    const executor = new ExecutorService(async () => ({ success: false, error: 'Login failed' }));
    const coordinator = new CoordinatorService(planner, executor);

    const state = await coordinator.run('task_002', 'org_001', 'Test task');
    expect(state.status).toBe(CoordinationStatus.FAILED);
    expect(state.error_message).toContain('Login failed');
  });
});

describe('Coordinator replan', () => {
  it('step2 fails replan continues', async () => {
    // Step0 Login 成功 → Step1 Navigate 失败 → Planner replan → 新步骤成功 → 任务完成
    const mockLlm = async (prompt: string): Promise<string> => {
      if (prompt.includes('## Failed Step')) {
        return JSON.stringify({
          steps: [
            { goal: 'Try alternative navigation path', completion_condition: 'Page found', failure_strategy: 'abort' },
            { goal: 'Download CSV', completion_condition: 'File saved', failure_strategy: 'retry' },
          ],
        });
      }
      return JSON.stringify({
        steps: [
          { goal: 'Login to e-banking', completion_condition: 'Logged in', failure_strategy: 'abort', max_retries: 0 },
          { goal: 'Navigate to statements page', completion_condition: 'Table visible', failure_strategy: 'replan', max_retries: 0 },
          { goal: 'Download CSV file', completion_condition: 'File saved', failure_strategy: 'retry' },
        ],
      });
    };
    const mockHandler = async (goal: string): Promise<HandlerResult> => {
      if (goal.includes('Navigate to statements')) {
        return { success: false, error: 'Statements button not found' };
      }
      return { success: true, data: { goal } };
    };
    const planner = new PlannerService(mockLlm);
    const executor = new ExecutorService(mockHandler);
    const coordinator = new CoordinatorService(planner, executor, { maxReplans: 3 });

    const state = await coordinator.run('task_003', 'org_001', 'Download bank statements for Q1');
    expect(state.status).toBe(CoordinationStatus.COMPLETED);
    expect(state.total_replans).toBe(1);
    // Step0 完成 + replan 2 新步骤 = 3 完成
    expect(state.completed_subtasks.length).toBe(3);
  });

  it('max replans exceeded goes to needs human', async () => {
    const mockLlm = async (): Promise<string> =>
      JSON.stringify({
        steps: [{ goal: 'Always fails', completion_condition: '', failure_strategy: 'replan', max_retries: 0 }],
      });
    const mockHandler = async (): Promise<HandlerResult> => ({ success: false, error: 'Permanent failure' });
    const planner = new PlannerService(mockLlm);
    const executor = new ExecutorService(mockHandler);
    const coordinator = new CoordinatorService(planner, executor, { maxReplans: 2 });

    const state = await coordinator.run('task_004', 'org_001', 'Impossible task');
    expect(state.status).toBe(CoordinationStatus.NEEDS_HUMAN);
    expect(state.total_replans).toBeGreaterThanOrEqual(2);
    expect(state.error_message).toContain('Max replans exceeded');
  });

  it('skip strategy continues', async () => {
    const mockLlm = async (): Promise<string> =>
      JSON.stringify({
        steps: [
          { goal: 'Close popup', completion_condition: '', failure_strategy: 'skip', max_retries: 0 },
          { goal: 'Do main work', completion_condition: 'Done', failure_strategy: 'abort' },
        ],
      });
    const callResults: HandlerResult[] = [
      { success: false, error: 'No popup found' }, // step 0 失败
      { success: true, data: {} }, // step 1 成功
    ];
    let callIdx = 0;
    const mockHandler = async (): Promise<HandlerResult> => callResults[callIdx++];
    const planner = new PlannerService(mockLlm);
    const executor = new ExecutorService(mockHandler);
    const coordinator = new CoordinatorService(planner, executor);

    const state = await coordinator.run('task_005', 'org_001', 'Main task');
    expect(state.status).toBe(CoordinationStatus.COMPLETED);
  });
});

describe('Coordinator audit', () => {
  it('audit callback called for each subtask', async () => {
    const auditRecords: { subtask_id: string; goal: string; success: boolean }[] = [];
    const auditCb = async (subtask: SubTask, result: { success: boolean }) => {
      auditRecords.push({ subtask_id: subtask.subtask_id, goal: subtask.goal, success: result.success });
    };
    const mockLlm = async (): Promise<string> =>
      JSON.stringify({
        steps: [
          { goal: 'Step A', completion_condition: '', failure_strategy: 'abort' },
          { goal: 'Step B', completion_condition: '', failure_strategy: 'abort' },
        ],
      });
    const mockHandler = async (): Promise<HandlerResult> => ({ success: true, data: {} });
    const planner = new PlannerService(mockLlm);
    const executor = new ExecutorService(mockHandler);
    const coordinator = new CoordinatorService(planner, executor, { auditCallback: auditCb });

    const state = await coordinator.run('task_006', 'org_001', 'Test audit');
    expect(state.status).toBe(CoordinationStatus.COMPLETED);
    expect(auditRecords.length).toBe(2);
    expect(auditRecords[0].goal).toBe('Step A');
    expect(auditRecords[1].goal).toBe('Step B');
    expect(auditRecords.every((r) => r.success)).toBe(true);
  });

  it('audit callback failure does not block', async () => {
    const failingAudit = async () => {
      throw new Error('Audit DB down');
    };
    const mockLlm = async (): Promise<string> =>
      JSON.stringify({ steps: [{ goal: 'Test', completion_condition: '', failure_strategy: 'abort' }] });
    const mockHandler = async (): Promise<HandlerResult> => ({ success: true, data: {} });
    const planner = new PlannerService(mockLlm);
    const executor = new ExecutorService(mockHandler);
    const coordinator = new CoordinatorService(planner, executor, { auditCallback: failingAudit });

    const state = await coordinator.run('task_007', 'org_001', 'Test');
    expect(state.status).toBe(CoordinationStatus.COMPLETED);
  });
});

describe('Coordinator resumption', () => {
  it('resume skips completed subtasks', async () => {
    const mockLlm = async (): Promise<string> =>
      JSON.stringify({
        steps: [
          { goal: 'Step A', completion_condition: '', failure_strategy: 'abort' },
          { goal: 'Step B', completion_condition: '', failure_strategy: 'abort' },
          { goal: 'Step C', completion_condition: '', failure_strategy: 'abort' },
        ],
      });
    const executeCalls: string[] = [];
    const mockHandler = async (goal: string): Promise<HandlerResult> => {
      executeCalls.push(goal);
      return { success: true, data: {} };
    };
    const planner = new PlannerService(mockLlm);
    const executor = new ExecutorService(mockHandler);
    const coordinator = new CoordinatorService(planner, executor);

    // 第一次跑，拿到 subtask ID
    const state1 = await coordinator.run('task_008', 'org_001', '3-step task');
    expect(state1.status).toBe(CoordinationStatus.COMPLETED);
    const firstSubtaskId = state1.completed_subtasks[0];

    // 第二次跑，从第一个 subtask 之后续跑
    executeCalls.length = 0;
    const state2 = await coordinator.run('task_008', 'org_001', '3-step task', undefined, [firstSubtaskId]);
    expect(state2.status).toBe(CoordinationStatus.COMPLETED);
  });
});
