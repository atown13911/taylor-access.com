export type PayrollEmploymentType = 'w2' | '1099';
export type PayrollPaymentMethod = 'direct_deposit' | 'check';
export type PayrollFilingStatus = 'single' | 'married_joint' | 'married_separate' | 'head_of_household';

export interface PayrollSetupSettings {
  employmentType: PayrollEmploymentType;
  paymentMethod: PayrollPaymentMethod;
  w4OnFile: boolean;
  w4SignedDate: string;
  federalFilingStatus: PayrollFilingStatus;
  federalExempt: boolean;
  extraFederalWithholding: number;
  w4DependentsCredit: number;
  w4OtherIncome: number;
  w4Deductions: number;
  w4TwoJobs: boolean;
  workState: string;
  residenceState: string;
  stateFilingStatus: PayrollFilingStatus;
  stateWithholdingPercent: number;
  extraStateWithholding: number;
  stateExempt: boolean;
  exemptSocialSecurity: boolean;
  exemptMedicare: boolean;
  healthInsurance: number;
  dentalInsurance: number;
  visionInsurance: number;
  retirement401kAmount: number;
  retirement401kPercent: number;
  hsaContribution: number;
  fsaContribution: number;
  garnishment: number;
  unionDues: number;
  otherPostTaxDeductions: number;
  defaultDeductions: number;
  defaultTaxWithholdingPct: number;
  payrollNotes: string;
  payType: string;
  payRate: number;
  standardHoursPerWeek: number;
  overtimeEligible: boolean;
  overtimeRateMultiplier: number;
}

export const PAYROLL_EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'w2', label: 'W-2 Employee' },
  { value: '1099', label: '1099 Contractor' }
];

export const PAYROLL_PAYMENT_METHOD_OPTIONS = [
  { value: 'direct_deposit', label: 'Direct deposit' },
  { value: 'check', label: 'Paper check' }
];

export const PAYROLL_FILING_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married filing jointly' },
  { value: 'married_separate', label: 'Married filing separately' },
  { value: 'head_of_household', label: 'Head of household' }
];

export const PAYROLL_US_STATE_OPTIONS = [
  { value: '', label: '— Select state —' },
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }
];

export function parsePayrollPreferences(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function extractPayrollBlob(employee: any): Record<string, unknown> {
  const prefs = parsePayrollPreferences(employee?.preferences ?? employee?.Preferences);
  const payroll = prefs?.['payroll'];
  return payroll && typeof payroll === 'object' ? payroll as Record<string, unknown> : {};
}

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function toNumberOrDefault(...values: unknown[]): number {
  let fallback = 0;
  if (values.length > 1) {
    const last = Number(values[values.length - 1]);
    if (Number.isFinite(last)) fallback = last;
  }
  for (let i = 0; i < values.length - 1; i++) {
    const parsed = Number(values[i]);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (values.length === 1) {
    const parsed = Number(values[0]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toBooleanOrDefault(...values: unknown[]): boolean {
  let fallback = false;
  if (values.length > 1) {
    const last = values[values.length - 1];
    if (typeof last === 'boolean') fallback = last;
  }
  for (let i = 0; i < values.length - (values.length > 1 && typeof values[values.length - 1] === 'boolean' ? 1 : 0); i++) {
    const value = values[i];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
      if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
    }
    if (typeof value === 'number') return value !== 0;
  }
  return fallback;
}

export function normalizeEmploymentType(value: string): PayrollEmploymentType {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('1099') || normalized.includes('contractor')) return '1099';
  return 'w2';
}

export function normalizePaymentMethod(value: string): PayrollPaymentMethod {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('check')) return 'check';
  return 'direct_deposit';
}

export function normalizeFederalFilingStatus(value: string): PayrollFilingStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('married') && normalized.includes('joint')) return 'married_joint';
  if (normalized.includes('married') && normalized.includes('separate')) return 'married_separate';
  if (normalized.includes('head')) return 'head_of_household';
  return 'single';
}

export function createEmptyPayrollSetup(): PayrollSetupSettings {
  return {
    employmentType: 'w2',
    paymentMethod: 'direct_deposit',
    w4OnFile: false,
    w4SignedDate: '',
    federalFilingStatus: 'single',
    federalExempt: false,
    extraFederalWithholding: 0,
    w4DependentsCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    w4TwoJobs: false,
    workState: '',
    residenceState: '',
    stateFilingStatus: 'single',
    stateWithholdingPercent: 0,
    extraStateWithholding: 0,
    stateExempt: false,
    exemptSocialSecurity: false,
    exemptMedicare: false,
    healthInsurance: 0,
    dentalInsurance: 0,
    visionInsurance: 0,
    retirement401kAmount: 0,
    retirement401kPercent: 0,
    hsaContribution: 0,
    fsaContribution: 0,
    garnishment: 0,
    unionDues: 0,
    otherPostTaxDeductions: 0,
    defaultDeductions: 0,
    defaultTaxWithholdingPct: 0,
    payrollNotes: '',
    payType: 'salary',
    payRate: 0,
    standardHoursPerWeek: 40,
    overtimeEligible: true,
    overtimeRateMultiplier: 1.5
  };
}

export function buildPayrollSetupFromEmployee(employee: any, payroll: Record<string, unknown> = extractPayrollBlob(employee)): PayrollSetupSettings {
  const empty = createEmptyPayrollSetup();
  return {
    ...empty,
    employmentType: normalizeEmploymentType(pickFirstText(employee?.employmentType, payroll['employmentType'])),
    paymentMethod: normalizePaymentMethod(pickFirstText(employee?.paymentMethod, payroll['paymentMethod'])),
    w4OnFile: toBooleanOrDefault(employee?.w4OnFile, payroll['w4OnFile'], employee?.W4OnFile),
    w4SignedDate: pickFirstText(employee?.w4SignedDate, payroll['w4SignedDate']),
    federalFilingStatus: normalizeFederalFilingStatus(pickFirstText(employee?.federalFilingStatus, payroll['federalFilingStatus'])),
    federalExempt: toBooleanOrDefault(employee?.federalExempt, payroll['federalExempt']),
    extraFederalWithholding: toNumberOrDefault(employee?.extraFederalWithholding, payroll['extraFederalWithholding'], 0),
    w4DependentsCredit: toNumberOrDefault(employee?.w4DependentsCredit, payroll['w4DependentsCredit'], 0),
    w4OtherIncome: toNumberOrDefault(employee?.w4OtherIncome, payroll['w4OtherIncome'], 0),
    w4Deductions: toNumberOrDefault(employee?.w4Deductions, payroll['w4Deductions'], 0),
    w4TwoJobs: toBooleanOrDefault(employee?.w4TwoJobs, payroll['w4TwoJobs']),
    workState: pickFirstText(employee?.workState, payroll['workState'], employee?.state).toUpperCase(),
    residenceState: pickFirstText(employee?.residenceState, payroll['residenceState'], employee?.state).toUpperCase(),
    stateFilingStatus: normalizeFederalFilingStatus(pickFirstText(employee?.stateFilingStatus, payroll['stateFilingStatus'])),
    stateWithholdingPercent: toNumberOrDefault(employee?.stateWithholdingPercent, payroll['stateWithholdingPercent'], 0),
    extraStateWithholding: toNumberOrDefault(employee?.extraStateWithholding, payroll['extraStateWithholding'], 0),
    stateExempt: toBooleanOrDefault(employee?.stateExempt, payroll['stateExempt']),
    exemptSocialSecurity: toBooleanOrDefault(employee?.exemptSocialSecurity, payroll['exemptSocialSecurity']),
    exemptMedicare: toBooleanOrDefault(employee?.exemptMedicare, payroll['exemptMedicare']),
    healthInsurance: toNumberOrDefault(employee?.healthInsurance, payroll['healthInsurance'], 0),
    dentalInsurance: toNumberOrDefault(employee?.dentalInsurance, payroll['dentalInsurance'], 0),
    visionInsurance: toNumberOrDefault(employee?.visionInsurance, payroll['visionInsurance'], 0),
    retirement401kAmount: toNumberOrDefault(employee?.retirement401kAmount, payroll['retirement401kAmount'], 0),
    retirement401kPercent: toNumberOrDefault(employee?.retirement401kPercent, payroll['retirement401kPercent'], 0),
    hsaContribution: toNumberOrDefault(employee?.hsaContribution, payroll['hsaContribution'], 0),
    fsaContribution: toNumberOrDefault(employee?.fsaContribution, payroll['fsaContribution'], 0),
    garnishment: toNumberOrDefault(employee?.garnishment, payroll['garnishment'], 0),
    unionDues: toNumberOrDefault(employee?.unionDues, payroll['unionDues'], 0),
    otherPostTaxDeductions: toNumberOrDefault(employee?.otherPostTaxDeductions, payroll['otherPostTaxDeductions'], 0),
    defaultDeductions: toNumberOrDefault(employee?.defaultDeductions, payroll['defaultDeductions'], payroll['periodDeductions'], 0),
    defaultTaxWithholdingPct: toNumberOrDefault(employee?.defaultTaxWithholdingPct, payroll['defaultTaxWithholdingPct'], 0),
    payrollNotes: pickFirstText(employee?.payrollNotes, payroll['payrollNotes'], payroll['contractNotes']),
    payType: pickFirstText(employee?.payType, payroll['payType'], 'salary'),
    payRate: toNumberOrDefault(employee?.payRate, payroll['payRate'], payroll['annualSalary'], 0),
    standardHoursPerWeek: toNumberOrDefault(employee?.standardHoursPerWeek, payroll['standardHoursPerWeek'], 40),
    overtimeEligible: toBooleanOrDefault(employee?.overtimeEligible, payroll['overtimeEligible'], true),
    overtimeRateMultiplier: toNumberOrDefault(employee?.overtimeRateMultiplier, payroll['overtimeRateMultiplier'], 1.5)
  };
}

export function buildPayrollSetupPreferencePayload(employee: any): Record<string, unknown> {
  const setup = buildPayrollSetupFromEmployee(employee);
  return { ...setup };
}

export function formatPayrollYesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export function formatPayrollCurrency(value: number): string {
  const amount = Number(value) || 0;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPayrollPercent(value: number): string {
  const amount = Number(value) || 0;
  return amount > 0 ? `${amount}%` : '—';
}

export function formatPayrollEmploymentType(value: PayrollEmploymentType): string {
  return value === '1099' ? '1099 Contractor' : 'W-2 Employee';
}

export function formatPayrollPaymentMethod(value: PayrollPaymentMethod): string {
  return value === 'check' ? 'Paper check' : 'Direct deposit';
}

export function formatPayrollFilingStatus(value: PayrollFilingStatus): string {
  switch (value) {
    case 'married_joint': return 'Married filing jointly';
    case 'married_separate': return 'Married filing separately';
    case 'head_of_household': return 'Head of household';
    default: return 'Single';
  }
}

export function formatPayrollState(value: string): string {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return '—';
  return PAYROLL_US_STATE_OPTIONS.find((item) => item.value === normalized)?.label ?? normalized;
}

export function formatPayrollDate(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
