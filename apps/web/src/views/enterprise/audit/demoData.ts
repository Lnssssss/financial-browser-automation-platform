import type { AuditLogEntry } from '@/api/enterprise';

export function demoLogs(): AuditLogEntry[] {
  return [
    {
      audit_log_id: 'aud_001', task_id: 'task_101', action_index: 1, action_type: 'CLICK',
      target_element: '登录按钮', input_value: '', page_url: 'https://bank.example.com/login',
      screenshot_before_url: null, screenshot_after_url: null,
      duration_ms: 450, executor: 'agent', execution_result: 'success', error_message: null,
      has_approval: false, created_at: '2026-03-07T10:00:05',
    },
    {
      audit_log_id: 'aud_002', task_id: 'task_101', action_index: 2, action_type: 'INPUT_TEXT',
      target_element: '用户名输入框', input_value: 'zhangwei', page_url: 'https://bank.example.com/login',
      screenshot_before_url: null, screenshot_after_url: null,
      duration_ms: 230, executor: 'agent', execution_result: 'success', error_message: null,
      has_approval: false, created_at: '2026-03-07T10:00:08',
    },
    {
      audit_log_id: 'aud_003', task_id: 'task_101', action_index: 3, action_type: 'INPUT_TEXT',
      target_element: '密码输入框', input_value: '********', page_url: 'https://bank.example.com/login',
      screenshot_before_url: null, screenshot_after_url: null,
      duration_ms: 180, executor: 'agent', execution_result: 'success', error_message: null,
      has_approval: false, created_at: '2026-03-07T10:00:10',
    },
    {
      audit_log_id: 'aud_004', task_id: 'task_102', action_index: 1, action_type: 'NAVIGATE',
      target_element: '转账页面', input_value: '', page_url: 'https://bank.example.com/transfer',
      screenshot_before_url: null, screenshot_after_url: null,
      duration_ms: 1200, executor: 'agent', execution_result: 'success', error_message: null,
      has_approval: true, created_at: '2026-03-07T10:15:00',
    },
    {
      audit_log_id: 'aud_005', task_id: 'task_102', action_index: 2, action_type: 'INPUT_TEXT',
      target_element: '金额输入框', input_value: '500,000.00', page_url: 'https://bank.example.com/transfer',
      screenshot_before_url: null, screenshot_after_url: null,
      duration_ms: 320, executor: 'agent', execution_result: 'failed', error_message: '输入过程中元素状态失效',
      has_approval: true, created_at: '2026-03-07T10:15:05',
    },
  ];
}
