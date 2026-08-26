export interface Department {
  id: string;
  name: string;
  children?: Department[];
}

export interface UserRow {
  user_id: string;
  name: string;
  department: string;
  role: string;
  business_lines: string[];
}

export const demoDepartments: Department[] = [
  {
    id: 'dept_1',
    name: 'Corporate Lending',
    children: [
      { id: 'dept_1a', name: 'Syndicated Loans' },
      { id: 'dept_1b', name: 'Trade Finance' },
    ],
  },
  {
    id: 'dept_2',
    name: 'Retail Banking',
    children: [
      { id: 'dept_2a', name: 'Personal Loans' },
      { id: 'dept_2b', name: 'Credit Cards' },
    ],
  },
  { id: 'dept_3', name: 'Asset Management' },
  { id: 'dept_4', name: 'Risk Management' },
  { id: 'dept_5', name: 'Compliance & Audit' },
  { id: 'dept_6', name: 'IT Department' },
];

export const demoUsers: UserRow[] = [
  { user_id: 'eu_01', name: '张伟', department: 'Corporate Lending', role: 'operator', business_lines: ['Corporate Loans', 'Intl Settlement'] },
  { user_id: 'eu_02', name: '李明', department: 'Corporate Lending', role: 'approver', business_lines: ['Corporate Loans'] },
  { user_id: 'eu_03', name: '王芳', department: 'Retail Banking', role: 'operator', business_lines: ['Retail Credit'] },
  { user_id: 'eu_04', name: '陈军', department: 'Risk Management', role: 'viewer', business_lines: ['ALL'] },
  { user_id: 'eu_05', name: '赵颖', department: 'Compliance & Audit', role: 'approver', business_lines: ['ALL'] },
  { user_id: 'eu_06', name: '刘洋', department: 'IT Department', role: 'org_admin', business_lines: ['ALL'] },
  { user_id: 'eu_07', name: '黄磊', department: 'Retail Banking', role: 'approver', business_lines: ['Retail Credit', 'Wealth Management'] },
  { user_id: 'eu_08', name: '孙娜', department: 'Asset Management', role: 'operator', business_lines: ['Wealth Management'] },
];

export const roleColors: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: 'bg-purple-100', text: 'text-purple-800' },
  org_admin: { bg: 'bg-blue-100', text: 'text-blue-800' },
  operator: { bg: 'bg-green-100', text: 'text-green-800' },
  approver: { bg: 'bg-amber-100', text: 'text-amber-800' },
  viewer: { bg: 'bg-gray-100', text: 'text-gray-700' },
};

export const deptNameKeys: Record<string, string> = {
  'Corporate Lending': 'permissions.blCorporateLending',
  'Syndicated Loans': 'permissions.blSyndicatedLoans',
  'Trade Finance': 'permissions.blTradeFinance',
  'Retail Banking': 'permissions.blRetailBanking',
  'Personal Loans': 'permissions.blPersonalLoans',
  'Credit Cards': 'permissions.blCreditCards',
  'Asset Management': 'permissions.blAssetManagement',
  'Risk Management': 'permissions.blRiskManagement',
  'Compliance & Audit': 'permissions.blComplianceAudit',
  'IT Department': 'permissions.blITDepartment',
};

export const roleNameKeys: Record<string, string> = {
  super_admin: 'permissions.roleSuperAdmin',
  org_admin: 'permissions.roleOrgAdmin',
  operator: 'permissions.roleOperator',
  approver: 'permissions.roleApprover',
  viewer: 'permissions.roleViewer',
};

export const blNameKeys: Record<string, string> = {
  'Corporate Loans': 'permissions.blCorporateLoans',
  'Intl Settlement': 'permissions.blIntlSettlement',
  'Retail Credit': 'permissions.blRetailCredit',
  'Wealth Management': 'permissions.blWealthManagement',
  Insurance: 'permissions.blInsurance',
  ALL: 'permissions.blAll',
};
