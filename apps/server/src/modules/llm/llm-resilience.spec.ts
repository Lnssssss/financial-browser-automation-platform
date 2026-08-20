import { describe, it, expect, vi } from 'vitest';
import {
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  HUMAN_ATTENTION_STATES,
  InvalidTransitionError,
  validateTransition,
} from './task-states';
import {
  ResponseSchema,
  SchemaValidationError,
  JsonParseError,
  buildStructuredPrompt,
  cleanLlmResponse,
  parseAndValidate,
  callLlmWithRetry,
  LlmCallable,
} from './resilient-caller';
import { estimateComplexity, routeModel, makeFeatures } from './model-router';
import { resolveStuckTask, makeResolution, StuckTaskInfo } from './human-intervention';

// 作为 llm 模块纯逻辑四件套的行为对齐基准。

// SampleResponse 等价：Pydantic 的 action:str/target:str/confidence:float。
const SAMPLE = new ResponseSchema<{ action: string; target: string; confidence: number }>('SampleResponse', {
  action: { type: 'string' },
  target: { type: 'string' },
  confidence: { type: 'number' },
});

// ============================================================
// Task State Machine
// ============================================================

describe('EnterpriseTaskStatus', () => {
  it('base states present in transition table', () => {
    for (const s of ['created', 'queued', 'running', 'completed', 'failed', 'terminated', 'timed_out', 'canceled']) {
      expect(s in VALID_TRANSITIONS).toBe(true);
    }
  });

  it('enterprise extension states present', () => {
    expect('pending_approval' in VALID_TRANSITIONS).toBe(true);
    expect('needs_human' in VALID_TRANSITIONS).toBe(true);
    expect('paused' in VALID_TRANSITIONS).toBe(true);
  });
});

describe('validateTransition', () => {
  it('running -> pending_approval valid', () => {
    expect(validateTransition('running', 'pending_approval')).toBe(true);
  });
  it('running -> needs_human valid', () => {
    expect(validateTransition('running', 'needs_human')).toBe(true);
  });
  it('running -> paused valid', () => {
    expect(validateTransition('running', 'paused')).toBe(true);
  });
  it('pending_approval -> running valid', () => {
    expect(validateTransition('pending_approval', 'running')).toBe(true);
  });
  it('pending_approval -> terminated valid', () => {
    expect(validateTransition('pending_approval', 'terminated')).toBe(true);
  });
  it('needs_human -> running valid', () => {
    expect(validateTransition('needs_human', 'running')).toBe(true);
  });
  it('needs_human -> terminated valid', () => {
    expect(validateTransition('needs_human', 'terminated')).toBe(true);
  });
  it('paused -> running valid', () => {
    expect(validateTransition('paused', 'running')).toBe(true);
  });
  it('completed is terminal (throws)', () => {
    expect(() => validateTransition('completed', 'running')).toThrow(InvalidTransitionError);
  });
  it('failed is terminal (throws)', () => {
    expect(() => validateTransition('failed', 'running')).toThrow(InvalidTransitionError);
  });
  it('created -> completed invalid (throws)', () => {
    expect(() => validateTransition('created', 'completed')).toThrow(InvalidTransitionError);
  });
});

describe('state set membership', () => {
  it('terminal states', () => {
    expect(TERMINAL_STATES.has('completed')).toBe(true);
    expect(TERMINAL_STATES.has('failed')).toBe(true);
    expect(TERMINAL_STATES.has('terminated')).toBe(true);
    expect(TERMINAL_STATES.has('running')).toBe(false);
  });
  it('human attention states', () => {
    expect(HUMAN_ATTENTION_STATES.has('pending_approval')).toBe(true);
    expect(HUMAN_ATTENTION_STATES.has('needs_human')).toBe(true);
    expect(HUMAN_ATTENTION_STATES.has('paused')).toBe(true);
    expect(HUMAN_ATTENTION_STATES.has('running')).toBe(false);
  });
});

describe('InvalidTransitionError', () => {
  it('message contains both states', () => {
    const err = new InvalidTransitionError('running', 'created');
    expect(err.message).toContain('running');
    expect(err.message).toContain('created');
  });
  it('exposes state attributes', () => {
    const err = new InvalidTransitionError('a', 'b');
    expect(err.currentState).toBe('a');
    expect(err.targetState).toBe('b');
  });
});

// ============================================================
// Resilient Caller
// ============================================================

describe('buildStructuredPrompt', () => {
  it('contains schema field names', () => {
    const prompt = buildStructuredPrompt('Click the button', SAMPLE);
    expect(prompt).toContain('action');
    expect(prompt).toContain('target');
    expect(prompt).toContain('confidence');
  });
  it('contains task description', () => {
    expect(buildStructuredPrompt('Click the button', SAMPLE)).toContain('Click the button');
  });
  it('contains JSON instruction', () => {
    expect(buildStructuredPrompt('test', SAMPLE)).toContain('JSON');
  });
  it('includes additional context', () => {
    const prompt = buildStructuredPrompt('test', SAMPLE, 'Page has 3 buttons');
    expect(prompt).toContain('Page has 3 buttons');
  });
});

describe('cleanLlmResponse', () => {
  it('plain json unchanged', () => {
    const raw = '{"action": "click", "target": "button", "confidence": 0.9}';
    expect(cleanLlmResponse(raw)).toBe(raw.trim());
  });
  it('strips json fence', () => {
    expect(cleanLlmResponse('```json\n{"action": "click"}\n```')).toBe('{"action": "click"}');
  });
  it('strips plain fence', () => {
    expect(cleanLlmResponse('```\n{"action": "click"}\n```')).toBe('{"action": "click"}');
  });
  it('strips surrounding whitespace', () => {
    expect(cleanLlmResponse('\n\n  {"action": "click"}  \n\n')).toBe('{"action": "click"}');
  });
  it('no fence preserved', () => {
    const raw = '{"key": "value"}';
    expect(cleanLlmResponse(raw)).toBe(raw);
  });
});

describe('parseAndValidate', () => {
  it('valid json parses and validates', () => {
    const result = parseAndValidate('{"action": "click", "target": "button", "confidence": 0.95}', SAMPLE);
    expect(result.action).toBe('click');
    expect(result.target).toBe('button');
    expect(result.confidence).toBe(0.95);
  });
  it('invalid json throws JsonParseError', () => {
    expect(() => parseAndValidate('not json at all', SAMPLE)).toThrow(JsonParseError);
  });
  it('schema mismatch throws SchemaValidationError', () => {
    expect(() => parseAndValidate('{"action": "click"}', SAMPLE)).toThrow(SchemaValidationError);
  });
  it('markdown wrapped parses', () => {
    const raw = '```json\n{"action": "click", "target": "btn", "confidence": 0.8}\n```';
    expect(parseAndValidate(raw, SAMPLE).action).toBe('click');
  });
});

describe('callLlmWithRetry', () => {
  it('success on first attempt', async () => {
    const llm: LlmCallable = vi.fn(async () => '{"action": "click", "target": "btn", "confidence": 0.9}');
    const result = await callLlmWithRetry(llm, buildStructuredPrompt('test', SAMPLE), SAMPLE, 3, [0, 0, 0]);
    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('click');
    expect(result.attempts).toBe(1);
    expect(result.needs_human).toBe(false);
  });

  it('success on second attempt after bad json', async () => {
    const responses = ['not valid json', '{"action": "click", "target": "btn", "confidence": 0.9}'];
    let i = 0;
    const llm: LlmCallable = vi.fn(async () => responses[i++]);
    const result = await callLlmWithRetry(llm, 'test', SAMPLE, 3, [0, 0, 0]);
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.errors.length).toBe(1);
  });

  it('all fail -> needs_human', async () => {
    const llm: LlmCallable = vi.fn(async () => 'garbage output');
    const result = await callLlmWithRetry(llm, 'test', SAMPLE, 3, [0, 0, 0]);
    expect(result.success).toBe(false);
    expect(result.needs_human).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.errors.length).toBe(3);
  });

  it('llm exception is retried', async () => {
    let callCount = 0;
    const llm: LlmCallable = async () => {
      callCount += 1;
      if (callCount < 3) {
        const e = new Error('LLM service unavailable');
        e.name = 'ConnectionError';
        throw e;
      }
      return '{"action": "click", "target": "btn", "confidence": 0.8}';
    };
    const result = await callLlmWithRetry(llm, 'test', SAMPLE, 3, [0, 0, 0]);
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.errors.length).toBe(2);
  });

  it('all exceptions -> needs_human with type name in error', async () => {
    const llm: LlmCallable = async () => {
      const e = new Error('down');
      e.name = 'ConnectionError';
      throw e;
    };
    const result = await callLlmWithRetry(llm, 'test', SAMPLE, 3, [0, 0, 0]);
    expect(result.success).toBe(false);
    expect(result.needs_human).toBe(true);
    expect(result.errors[0]).toContain('ConnectionError');
  });

  it('validation error is retried', async () => {
    const responses = ['{"action": "click"}', '{"action": "click", "target": "btn", "confidence": 0.9}'];
    let i = 0;
    const llm: LlmCallable = vi.fn(async () => responses[i++]);
    const result = await callLlmWithRetry(llm, 'test', SAMPLE, 3, [0, 0, 0]);
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });
});

// ============================================================
// Model Router
// ============================================================

describe('estimateComplexity', () => {
  it('simple page', () => {
    expect(estimateComplexity(makeFeatures({ element_count: 50 }))).toBe('simple');
  });
  it('moderate element count', () => {
    expect(estimateComplexity(makeFeatures({ element_count: 200 }))).toBe('moderate');
  });
  it('complex element count', () => {
    expect(estimateComplexity(makeFeatures({ element_count: 600 }))).toBe('complex');
  });
  it('iframe -> moderate', () => {
    expect(estimateComplexity(makeFeatures({ has_iframe: true, iframe_depth: 1, element_count: 50 }))).toBe('moderate');
  });
  it('deep iframe -> complex', () => {
    expect(estimateComplexity(makeFeatures({ has_iframe: true, iframe_depth: 2, element_count: 50 }))).toBe('complex');
  });
  it('shadow dom -> complex', () => {
    expect(estimateComplexity(makeFeatures({ has_shadow_dom: true, element_count: 50 }))).toBe('complex');
  });
  it('dynamic content -> moderate', () => {
    expect(estimateComplexity(makeFeatures({ has_dynamic_content: true, element_count: 50 }))).toBe('moderate');
  });
  it('many form fields -> complex', () => {
    expect(estimateComplexity(makeFeatures({ form_field_count: 25, element_count: 50 }))).toBe('complex');
  });
  it('minimal page -> simple', () => {
    expect(estimateComplexity(makeFeatures())).toBe('simple');
  });
});

describe('routeModel', () => {
  it('simple routes to light', () => {
    const d = routeModel(makeFeatures({ element_count: 30 }));
    expect(d.model_tier).toBe('light');
    expect(d.complexity).toBe('simple');
  });
  it('moderate routes to standard', () => {
    const d = routeModel(makeFeatures({ element_count: 200, has_dynamic_content: true }));
    expect(d.model_tier).toBe('standard');
  });
  it('complex routes to heavy', () => {
    const d = routeModel(makeFeatures({ element_count: 600, has_iframe: true, iframe_depth: 3 }));
    expect(d.model_tier).toBe('heavy');
  });
  it('decision has reason', () => {
    expect(routeModel(makeFeatures({ element_count: 200 })).reason).toContain('elements=200');
  });
  it('decision preserves features identity', () => {
    const f = makeFeatures({ element_count: 100, has_shadow_dom: true });
    expect(routeModel(f).features).toBe(f);
  });
});

// ============================================================
// Human Intervention
// ============================================================

function makeStuckTask(overrides: Partial<StuckTaskInfo> = {}): StuckTaskInfo {
  return {
    task_id: 'task_1',
    org_id: 'org_1',
    department_id: 'dept_a',
    stuck_action_index: 2,
    stuck_action_type: 'input_text',
    page_url: 'https://bank.example.com/transfer',
    screenshot_key: 'audit/org_1/task_1/2_after_abc.png',
    llm_errors: ['Attempt 1: JSON error', 'Attempt 2: timeout', 'Attempt 3: timeout'],
    llm_raw_response: '{"invalid": true}',
    stuck_since: '2026-03-07T10:00:00',
    total_actions: 5,
    completed_actions: 2,
    ...overrides,
  };
}

describe('resolveStuckTask', () => {
  it('skip_step resumes from next action', () => {
    const result = resolveStuckTask(
      makeStuckTask(),
      makeResolution({ task_id: 'task_1', action: 'skip_step', resolved_by: 'eu_1', note: 'Not critical, skip' }),
    );
    expect(result.new_status).toBe('running');
    expect(result.resume_from_action).toBe(3); // stuck at 2, resume from 3
    expect(result.resolution).toBe('skip_step');
  });

  it('manual_complete carries result', () => {
    const result = resolveStuckTask(
      makeStuckTask(),
      makeResolution({
        task_id: 'task_1',
        action: 'manual_complete',
        resolved_by: 'eu_1',
        manual_result: { account: 'done' },
      }),
    );
    expect(result.new_status).toBe('running');
    expect(result.resume_from_action).toBe(3);
    expect(result.manual_result).toEqual({ account: 'done' });
  });

  it('terminate stops task', () => {
    const result = resolveStuckTask(
      makeStuckTask(),
      makeResolution({ task_id: 'task_1', action: 'terminate', resolved_by: 'eu_1', note: 'Cannot proceed' }),
    );
    expect(result.new_status).toBe('terminated');
    expect(result.resolution).toBe('terminate');
  });

  it('invalid action throws', () => {
    expect(() =>
      resolveStuckTask(
        makeStuckTask(),
        makeResolution({ task_id: 'task_1', action: 'invalid_action' as never, resolved_by: 'eu_1' }),
      ),
    ).toThrow();
  });
});

describe('makeResolution', () => {
  it('auto fills resolved_at timestamp', () => {
    const r = makeResolution({ task_id: 't', action: 'skip_step', resolved_by: 'u' });
    expect(r.resolved_at).not.toBe('');
    expect(r.resolved_at).toContain('T');
  });
});

describe('StuckTaskInfo shape', () => {
  it('carries stuck context fields', () => {
    const task = makeStuckTask();
    expect(task.stuck_action_index).toBe(2);
    expect(task.completed_actions).toBe(2);
    expect(task.total_actions).toBe(5);
    expect(task.llm_errors.length).toBe(3);
  });
});
