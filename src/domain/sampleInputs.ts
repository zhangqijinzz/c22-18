import type {
  RuleField,
  SampleInput,
  SampleInputSources,
  ScalarValue,
} from '../models/ruleModel';

/** 未填写的唯一表示：''（数值）或键缺失；undefined 同样视为未填写。 */
export function isUnfilledValue(value: ScalarValue | '' | undefined): value is '' | undefined {
  return value === undefined || value === '';
}

export function isFieldFilled(sampleInputs: SampleInput, fieldId: string): boolean {
  return !isUnfilledValue(sampleInputs[fieldId]);
}

/** 某字段的系统默认值：数值取最小值、枚举取第一个选项、布尔取否。 */
export function defaultFieldValue(field: RuleField): ScalarValue | '' {
  if (field.type === 'number') return field.min ?? 0;
  if (field.type === 'enum') return field.enumValues?.[0] ?? '';
  return false;
}

/** 值是否符合字段当前定义（范围合法性不在此处判断，交求职时校验）。 */
function valueMatchesField(value: ScalarValue, field: RuleField): boolean {
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (field.type === 'enum') return typeof value === 'string' && (field.enumValues ?? []).includes(value);
  return typeof value === 'boolean';
}

/**
 * 按当前字段集合清洗样例输入：
 * 删除已不存在字段的键；类型不匹配或已不在枚举选项中的值归为未填写（''）。
 * 不会注入任何默认值，也不替用户决定未填字段。
 */
export function sanitizeSampleInputs(raw: unknown, fields: RuleField[]): {
  sampleInputs: SampleInput;
  sources: SampleInputSources;
  /** 清洗后仍处于未填写状态的字段（仅统计字段定义合法的字段）。 */
  missingFieldIds: string[];
} {
  const record = isRecord(raw) ? raw as Record<string, unknown> : {};
  const sampleInputs: SampleInput = {};
  const sources: SampleInputSources = {};
  const missingFieldIds: string[] = [];
  for (const field of fields) {
    const value = record[field.id];
    if (value === undefined || value === null || value === '') {
      sampleInputs[field.id] = '';
      missingFieldIds.push(field.id);
      continue;
    }
    const scalar = value as ScalarValue;
    if (!valueMatchesField(scalar, field)) {
      sampleInputs[field.id] = '';
      missingFieldIds.push(field.id);
      continue;
    }
    sampleInputs[field.id] = scalar;
    sources[field.id] = 'user';
  }
  return { sampleInputs, sources, missingFieldIds };
}

/** 未填写字段的默认值映射，用于“从此版本继续”等结构对齐场景（仍不写入项目）。 */
export function emptySampleInputs(fields: RuleField[]): SampleInput {
  return Object.fromEntries(fields.map((field) => [field.id, '']));
}

/**
 * 显式补全：仅填充当前未填写的字段，填入系统默认值并标记为 'auto'。
 * 已填写（无论用户填写还是之前系统补入）的值保持不动。
 */
export function fillMissingSampleInputs(
  fields: RuleField[],
  sampleInputs: SampleInput,
  sources: SampleInputSources,
): { sampleInputs: SampleInput; sources: SampleInputSources; filledFieldIds: string[] } {
  const nextInputs: SampleInput = { ...sampleInputs };
  const nextSources: SampleInputSources = { ...sources };
  const filledFieldIds: string[] = [];
  for (const field of fields) {
    if (isFieldFilled(nextInputs, field.id)) continue;
    const value = defaultFieldValue(field);
    if (value === '') continue;
    nextInputs[field.id] = value;
    nextSources[field.id] = 'auto';
    filledFieldIds.push(field.id);
  }
  return { sampleInputs: nextInputs, sources: nextSources, filledFieldIds };
}

/** 清空全部样例输入（未填写态）。 */
export function clearSampleInputs(fields: RuleField[]): {
  sampleInputs: SampleInput;
  sources: SampleInputSources;
} {
  return { sampleInputs: emptySampleInputs(fields), sources: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
