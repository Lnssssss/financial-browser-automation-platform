// 金融行业高危操作关键词库 + 金额识别。
//
// 三个行业垂直领域（银行/保险/证券）的中英双语关键词，每条带风险等级和分类；
// 外加一组金额识别正则，用于"大额升级"规则。纯数据 + 纯函数，无外部依赖。

/// 行业类型。命中关键词时可按行业缩小匹配范围。
export enum IndustryType {
  BANKING = 'banking',
  INSURANCE = 'insurance',
  SECURITIES = 'securities',
}

/// 风险等级。低→高：low < medium < high < critical。
/// 值为小写字符串，贯穿风险识别→路由→审批记录全链路，无需转换。
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/// 一条关键词及其风险元数据。
export interface KeywordEntry {
  keyword: string;
  risk_level: 'medium' | 'high' | 'critical'; // 关键词本身不会是 low（low = 没命中）
  category: string; // 如 fund_transfer / account_ops
  description?: string;
}

// ── 金额识别正则 ──────────────────────────────────────────────
// 识别 ¥50万 / $1,000,000 / 500万元 / 1.5亿 等写法。用于判断"是否含大额"。

const AMOUNT_PATTERNS: RegExp[] = [
  /[¥￥$€£]\s*[\d,]+\.?\d*/gi,
  /[\d,]+\.?\d*\s*[万亿]?\s*[元圆]/gi,
  /\b\d{1,3}(,\d{3})+(\.\d{1,2})?\b/g, // 1,000,000.00
  /\b\d+\.?\d*\s*(million|billion|万|亿)\b/gi,
];

// 捕获"数字 + 单位"，据此判断是否达到大额阈值。
const HIGH_AMOUNT_REGEX = /(\d[\d,]*\.?\d*)\s*(万|亿|million|billion)/gi;

/// 抽取文本里所有金额字符串（调试/展示用）。
export function detectAmounts(text: string): string[] {
  const results: string[] = [];
  for (const pattern of AMOUNT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      results.push(m[0]);
      if (m.index === re.lastIndex) re.lastIndex++; // 防零宽匹配死循环
    }
  }
  return results;
}

/// 是否含大额金额（>= 100万 或 >= 1 million 或 任意"亿/billion"）。
export function hasHighAmount(text: string): boolean {
  const re = new RegExp(HIGH_AMOUNT_REGEX.source, HIGH_AMOUNT_REGEX.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const numStr = m[1].replace(/,/g, '');
    const unit = m[2].toLowerCase();
    const num = Number(numStr);
    if (Number.isNaN(num)) continue;
    if (unit === '亿' || unit === 'billion') return true;
    if (unit === '万' && num >= 100) return true;
    if (unit === 'million' && num >= 1) return true;
  }
  return false;
}

// ── 银行场景 ─────────────────────────────────────────────────
const BANKING_KEYWORDS: KeywordEntry[] = [
  // 资金流动
  { keyword: '转账', risk_level: 'high', category: 'fund_transfer', description: 'Bank transfer' },
  { keyword: '汇款', risk_level: 'high', category: 'fund_transfer', description: 'Remittance' },
  { keyword: '划转', risk_level: 'high', category: 'fund_transfer', description: 'Fund transfer between accounts' },
  { keyword: '跨行转账', risk_level: 'critical', category: 'fund_transfer', description: 'Inter-bank transfer' },
  { keyword: '大额转账', risk_level: 'critical', category: 'fund_transfer', description: 'Large amount transfer' },
  { keyword: 'wire transfer', risk_level: 'high', category: 'fund_transfer' },
  { keyword: 'fund transfer', risk_level: 'high', category: 'fund_transfer' },
  { keyword: 'remittance', risk_level: 'high', category: 'fund_transfer' },
  { keyword: '电汇', risk_level: 'high', category: 'fund_transfer', description: 'Telegraphic transfer' },
  { keyword: '批量转账', risk_level: 'critical', category: 'fund_transfer', description: 'Batch transfer' },
  { keyword: 'batch payment', risk_level: 'critical', category: 'fund_transfer' },
  // 账户操作
  { keyword: '销户', risk_level: 'critical', category: 'account_ops', description: 'Account closure' },
  { keyword: '冻结', risk_level: 'high', category: 'account_ops', description: 'Account freeze' },
  { keyword: '解冻', risk_level: 'high', category: 'account_ops', description: 'Account unfreeze' },
  { keyword: '挂失', risk_level: 'high', category: 'account_ops', description: 'Loss report' },
  { keyword: 'close account', risk_level: 'critical', category: 'account_ops' },
  { keyword: 'freeze account', risk_level: 'high', category: 'account_ops' },
  { keyword: 'unfreeze', risk_level: 'high', category: 'account_ops' },
  { keyword: '密码重置', risk_level: 'high', category: 'account_ops', description: 'Password reset' },
  { keyword: 'password reset', risk_level: 'high', category: 'account_ops' },
  { keyword: '修改预留信息', risk_level: 'high', category: 'account_ops', description: 'Modify reserved info' },
  // 授信操作
  { keyword: '放款', risk_level: 'critical', category: 'credit_ops', description: 'Loan disbursement' },
  { keyword: '展期', risk_level: 'high', category: 'credit_ops', description: 'Loan extension' },
  { keyword: '核销', risk_level: 'critical', category: 'credit_ops', description: 'Write-off' },
  { keyword: '贷款发放', risk_level: 'critical', category: 'credit_ops', description: 'Loan issuance' },
  { keyword: '授信额度调整', risk_level: 'critical', category: 'credit_ops', description: 'Credit limit adjustment' },
  { keyword: 'loan disbursement', risk_level: 'critical', category: 'credit_ops' },
  { keyword: 'credit limit', risk_level: 'high', category: 'credit_ops' },
  { keyword: 'write-off', risk_level: 'critical', category: 'credit_ops' },
  { keyword: 'loan extension', risk_level: 'high', category: 'credit_ops' },
  { keyword: '担保变更', risk_level: 'high', category: 'credit_ops', description: 'Guarantee modification' },
  // 审批合规
  { keyword: '审批通过', risk_level: 'medium', category: 'approval', description: 'Approval granted' },
  { keyword: 'override', risk_level: 'high', category: 'approval', description: 'Override control' },
  { keyword: '超授权', risk_level: 'critical', category: 'approval', description: 'Exceed authorization' },
  { keyword: 'bypass', risk_level: 'high', category: 'approval', description: 'Bypass control' },
];

// ── 保险场景 ─────────────────────────────────────────────────
const INSURANCE_KEYWORDS: KeywordEntry[] = [
  // 理赔
  { keyword: '理赔提交', risk_level: 'high', category: 'claims', description: 'Claim submission' },
  { keyword: '理赔审核', risk_level: 'high', category: 'claims', description: 'Claim review' },
  { keyword: '理赔支付', risk_level: 'critical', category: 'claims', description: 'Claim payment' },
  { keyword: 'claim submission', risk_level: 'high', category: 'claims' },
  { keyword: 'claim payment', risk_level: 'critical', category: 'claims' },
  { keyword: '赔付', risk_level: 'high', category: 'claims', description: 'Indemnity payment' },
  { keyword: '大额理赔', risk_level: 'critical', category: 'claims', description: 'Large claim' },
  // 承保
  { keyword: '承保确认', risk_level: 'high', category: 'underwriting', description: 'Underwriting confirmation' },
  { keyword: '核保', risk_level: 'high', category: 'underwriting', description: 'Underwriting review' },
  { keyword: 'underwriting', risk_level: 'high', category: 'underwriting' },
  { keyword: '出单', risk_level: 'medium', category: 'underwriting', description: 'Policy issuance' },
  { keyword: '批单', risk_level: 'high', category: 'underwriting', description: 'Endorsement' },
  // 保单变更
  { keyword: '退保', risk_level: 'critical', category: 'policy_change', description: 'Surrender/cancel policy' },
  { keyword: '保单修改', risk_level: 'high', category: 'policy_change', description: 'Policy modification' },
  { keyword: '受益人变更', risk_level: 'critical', category: 'policy_change', description: 'Beneficiary change' },
  { keyword: 'surrender', risk_level: 'critical', category: 'policy_change' },
  { keyword: 'beneficiary change', risk_level: 'critical', category: 'policy_change' },
  { keyword: 'policy cancellation', risk_level: 'critical', category: 'policy_change' },
  { keyword: '保额调整', risk_level: 'high', category: 'policy_change', description: 'Coverage adjustment' },
  { keyword: '投保人变更', risk_level: 'critical', category: 'policy_change', description: 'Policyholder change' },
  { keyword: '缴费方式变更', risk_level: 'medium', category: 'policy_change', description: 'Payment method change' },
];

// ── 证券场景 ─────────────────────────────────────────────────
const SECURITIES_KEYWORDS: KeywordEntry[] = [
  // 交易
  { keyword: '委托下单', risk_level: 'high', category: 'trading', description: 'Order placement' },
  { keyword: '撤单', risk_level: 'high', category: 'trading', description: 'Order cancellation' },
  { keyword: '大宗交易', risk_level: 'critical', category: 'trading', description: 'Block trade' },
  { keyword: 'place order', risk_level: 'high', category: 'trading' },
  { keyword: 'cancel order', risk_level: 'high', category: 'trading' },
  { keyword: 'block trade', risk_level: 'critical', category: 'trading' },
  { keyword: '市价委托', risk_level: 'high', category: 'trading', description: 'Market order' },
  { keyword: '限价委托', risk_level: 'medium', category: 'trading', description: 'Limit order' },
  // 融资融券
  { keyword: '融资买入', risk_level: 'critical', category: 'margin', description: 'Margin buy' },
  { keyword: '融券卖出', risk_level: 'critical', category: 'margin', description: 'Short sell' },
  { keyword: 'margin buy', risk_level: 'critical', category: 'margin' },
  { keyword: 'short sell', risk_level: 'critical', category: 'margin' },
  { keyword: '担保品划转', risk_level: 'high', category: 'margin', description: 'Collateral transfer' },
  { keyword: '追加保证金', risk_level: 'high', category: 'margin', description: 'Margin call' },
  { keyword: 'margin call', risk_level: 'high', category: 'margin' },
  { keyword: '强制平仓', risk_level: 'critical', category: 'margin', description: 'Forced liquidation' },
  { keyword: 'forced liquidation', risk_level: 'critical', category: 'margin' },
  // 资金操作
  { keyword: '资金划拨', risk_level: 'critical', category: 'fund_ops', description: 'Fund allocation' },
  { keyword: '银证转账', risk_level: 'high', category: 'fund_ops', description: 'Bank-securities transfer' },
  { keyword: 'fund allocation', risk_level: 'critical', category: 'fund_ops' },
  { keyword: 'bank transfer', risk_level: 'high', category: 'fund_ops' },
  { keyword: '出金', risk_level: 'high', category: 'fund_ops', description: 'Withdrawal' },
  { keyword: '入金', risk_level: 'medium', category: 'fund_ops', description: 'Deposit' },
  // 账户操作
  { keyword: '销户', risk_level: 'critical', category: 'account_ops', description: 'Account closure' },
  { keyword: '开户', risk_level: 'medium', category: 'account_ops', description: 'Account opening' },
  { keyword: '权限变更', risk_level: 'high', category: 'account_ops', description: 'Permission change' },
];

/// 按行业查表。
export const INDUSTRY_KEYWORDS: Record<IndustryType, KeywordEntry[]> = {
  [IndustryType.BANKING]: BANKING_KEYWORDS,
  [IndustryType.INSURANCE]: INSURANCE_KEYWORDS,
  [IndustryType.SECURITIES]: SECURITIES_KEYWORDS,
};

/// 未指定行业时匹配全部关键词。
export const ALL_KEYWORDS: KeywordEntry[] = [
  ...BANKING_KEYWORDS,
  ...INSURANCE_KEYWORDS,
  ...SECURITIES_KEYWORDS,
];
