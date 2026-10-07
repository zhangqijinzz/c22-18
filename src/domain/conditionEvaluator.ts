import type {
  BusinessRule,
  ConditionGroup,
  PredicateCondition,
  RuleCondition,
  RuleField,
  RuleProject,
  SampleEvaluation,
  SampleFieldIssue,
  SampleInput,
  ScalarValue,
} from '../models/ruleModel';

export function matchesCondition(condition: RuleCondition, values: SampleInput): boolean {
  if (condition.kind === 'group') {
    const checks = condition.conditions.map((child) => matchesCondition(child, values));
    return condition.operator === 'and' ? checks.every(Boolean) : checks.some(Boolean);
  }
  const actual = values[condition.fieldId];
  if (condition.operator === 'isTrue') return actual === true;
  if (condition.operator === 'isFalse') return actual === false;
  if (condition.operator === 'between') {
    return typeof actual === 'number' && actual >= condition.value.min && actual <= condition.value.max;
  }
  if (typeof condition.value === 'number') {
    if (typeof actual !== 'number') return false;
    switch (condition.operator) {
      case 'eq': return actual === condition.value;
      case 'gt': return actual > condition.value;
      case 'gte': return actual >= condition.value;
      case 'lt': return actual < condition.value;
      case 'lte': return actual <= condition.value;
      default: return false;
    }
  }
  if (typeof actual !== 'string') return false;
  return condition.operator === 'eq' ? actual === condition.value : actual !== condition.value;
}

export function matchesRule(rule: BusinessRule, values: SampleInput): boolean {
  return matchesCondition(rule.conditions, values);
}

export function isSampleBlank(value: ScalarValue | '' | undefined): boolean {
  return value === undefined || value === '';
}

export function evaluateSample(project: RuleProject, values: SampleInput): SampleEvaluation {
  const issues: SampleFieldIssue[] = [];
  const missingFieldIds: string[] = [];
  const invalidFieldIds: string[] = [];
  for (const field of project.fields) {
    const value = values[field.id];
    if (isSampleBlank(value)) {
      missingFieldIds.push(field.id);
      issues.push({ fieldId: field.id, kind: 'missing', message: `请填写“${field.name}”` });
      continue;
    }
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        invalidFieldIds.push(field.id);
        issues.push({ fieldId: field.id, kind: 'invalid', message: `“${field.name}”必须是有效数值` });
      } else if (value < (field.min ?? -Infinity) || value > (field.max ?? Infinity)) {
        invalidFieldIds.push(field.id);
        issues.push({ fieldId: field.id, kind: 'invalid', message: `“${field.name}”需在 ${field.min} 到 ${field.max} 之间` });
      }
    }
    if (field.type === 'enum' && (typeof value !== 'string' || !(field.enumValues ?? []).includes(value))) {
      invalidFieldIds.push(field.id);
      issues.push({ fieldId: field.id, kind: 'invalid', message: `“${field.name}”需要选择一个合法选项` });
    }
    if (field.type === 'boolean' && typeof value !== 'boolean') {
      invalidFieldIds.push(field.id);
      issues.push({ fieldId: field.id, kind: 'invalid', message: `“${field.name}”需要选择是或否` });
    }
  }
  if (issues.length) {
    return { valid: false, errors: issues.map((issue) => issue.message), issues, matchedRules: [], missingFieldIds, invalidFieldIds };
  }
  const matchedRules = project.rules
    .filter((rule) => matchesRule(rule, values))
    .sort((a, b) => b.priority - a.priority || project.rules.indexOf(a) - project.rules.indexOf(b));
  return { valid: true, errors: [], issues: [], matchedRules, winner: matchedRules[0], missingFieldIds: [], invalidFieldIds: [] };
}

export function defaultValueForField(field: RuleField): ScalarValue {
  if (field.type === 'number') return field.min ?? 0;
  if (field.type === 'enum') return field.enumValues?.[0] ?? '';
  return false;
}

/**
 * 找出当前还没填写、且存在可用默认值的字段。没有任何选项的枚举没有默认值，
 * 不会被视作可补全目标。
 */
export function findMissingFieldIds(fields: RuleField[], values: SampleInput): string[] {
  return fields
    .filter((field) => isSampleBlank(values[field.id]) && !isSampleBlank(defaultValueForField(field)))
    .map((field) => field.id);
}

/**
 * 让样例输入与字段集合保持一致：删掉已不存在字段的遗留值，新字段保留为未填。
 * 这里绝不替用户补默认值——未填和“填了最小值/否”必须能区分。
 */
export function syncSampleInputs(fields: RuleField[], values: SampleInput): SampleInput {
  const next: SampleInput = {};
  for (const field of fields) {
    const value = values[field.id];
    next[field.id] = value === undefined ? '' : value;
  }
  return next;
}

/**
 * 显式补全：只填未填写的字段，返回补好的输入与本次实际补过的字段。
 * 这个动作必须由用户在界面上主动触发，而不是在字段增删或数据恢复时静默发生。
 */
export function fillMissingSample(fields: RuleField[], values: SampleInput): { values: SampleInput; filledFieldIds: string[] } {
  const next: SampleInput = { ...values };
  const filledFieldIds: string[] = [];
  for (const field of fields) {
    if (!isSampleBlank(next[field.id])) continue;
    const fallback = defaultValueForField(field);
    if (isSampleBlank(fallback)) continue;
    next[field.id] = fallback;
    filledFieldIds.push(field.id);
  }
  return { values: next, filledFieldIds };
}

export function group(operator: ConditionGroup['operator'], ...conditions: RuleCondition[]): ConditionGroup {
  return { kind: 'group', operator, conditions };
}

export function predicate(condition: PredicateCondition): PredicateCondition {
  return condition;
}
