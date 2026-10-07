import { describe, expect, it } from 'vitest';
import { defaultValueForField, evaluateSample, fillMissingSample, findMissingFieldIds, syncSampleInputs } from '../domain/conditionEvaluator';
import { validateField, validateProject } from '../domain/fieldValidation';
import { analyzeRules } from '../domain/ruleAnalysis';
import type { BusinessRule, RuleField, RuleProject } from '../models/ruleModel';

const amount: RuleField = { id: 'amount', name: '金额', type: 'number', min: 0, max: 1000 };
const tier: RuleField = { id: 'tier', name: '等级', type: 'enum', enumValues: ['basic', 'gold'] };
const active: RuleField = { id: 'active', name: '启用', type: 'boolean' };

function makeRule(id: string, conditions: BusinessRule['conditions'], priority = 10, result = id): BusinessRule {
  return { id, name: id, conditions, priority, result };
}

function project(rules: BusinessRule[], fields: RuleField[] = [amount, tier, active]): RuleProject {
  return { id: 'p', title: '测试项目', fields, rules, sampleInputs: {}, versions: [], updatedAt: 1 };
}

const amountAtLeast = (value: number): BusinessRule['conditions'] => ({ kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'amount', operator: 'gte', value }] });

describe('field and project validation', () => {
  it('accepts inclusive boundary ranges and rejects reversed or empty definitions', () => {
    expect(validateField({ ...amount, min: 5, max: 5 })).toEqual([]);
    expect(validateField({ ...amount, min: 11, max: 10 }).map((issue) => issue.code)).toContain('number-range-order');
    expect(validateField({ id: 'tier', name: '等级', type: 'enum', enumValues: [] }).map((issue) => issue.code)).toContain('enum-values-required');
  });

  it('checks enum and boolean predicate types without depending on React', () => {
    const rules = [
      makeRule('gold', { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'tier', operator: 'eq', value: 'gold' }] }),
      makeRule('active', { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'active', operator: 'isTrue', value: true }] }),
    ];
    expect(validateProject(project(rules))).toEqual([]);
    expect(evaluateSample(project(rules), { amount: 12, tier: 'gold', active: true }).matchedRules.map((rule) => rule.id)).toEqual(['gold', 'active']);
  });
});

describe('rule consistency analysis', () => {
  it('finds partial overlap, same-priority conflicts, lower-priority shadowing, unreachable rules, and gaps', () => {
    const rules = [
      makeRule('base', amountAtLeast(500), 10, 'standard'),
      makeRule('partial', { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'amount', operator: 'between', value: { min: 300, max: 800 } }] }, 20, 'special'),
      makeRule('conflict', amountAtLeast(700), 20, 'different'),
      makeRule('hidden', amountAtLeast(750), 5, 'hidden'),
      makeRule('impossible', amountAtLeast(1001), 50, 'out of range'),
      makeRule('no-overlap', { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'amount', operator: 'lt', value: 250 }] }, 1, 'separate'),
    ];
    const analysis = analyzeRules(project(rules));
    expect(analysis.overlaps.some((overlap) => overlap.ruleAId === 'partial' && overlap.ruleBId === 'conflict' && overlap.conflict)).toBe(true);
    expect(analysis.overlaps.some((overlap) => overlap.ruleAId === 'base' && overlap.ruleBId === 'no-overlap')).toBe(false);
    expect(analysis.unreachableRuleIds).toContain('impossible');
    expect(analysis.shadowedRuleIds).toContain('hidden');
    expect(analysis.uncoveredExamples.length).toBeGreaterThan(0);
    expect(analysis.checkedCases).toBeGreaterThan(0);
  });

  it('evaluates OR groups and validates missing sample inputs precisely', () => {
    const rule = makeRule('either', { kind: 'group', operator: 'or', conditions: [
      { kind: 'predicate', fieldId: 'tier', operator: 'eq', value: 'gold' },
      { kind: 'predicate', fieldId: 'active', operator: 'isTrue', value: true },
    ] });
    const result = evaluateSample(project([rule]), { amount: 10, tier: 'basic', active: true });
    expect(result.valid).toBe(true);
    expect(result.winner?.id).toBe('either');
    const missing = evaluateSample(project([rule]), { amount: 10, tier: 'gold' });
    expect(missing.errors).toEqual(['请填写“启用”']);
    expect(missing.missingFieldIds).toEqual(['active']);
    expect(missing.invalidFieldIds).toEqual([]);
  });

  it('distinguishes unfilled fields from values that equal the defaults', () => {
    const rules = [makeRule('amount-zero', amountAtLeast(0))];
    const current = project(rules);
    // 布尔字段“否”是一个合法的用户输入，不能与未填混淆。
    const explicitFalse = evaluateSample(current, { amount: 0, tier: 'basic', active: false });
    expect(explicitFalse.valid).toBe(true);
    expect(explicitFalse.matchedRules.map((rule) => rule.id)).toEqual(['amount-zero']);
    // 全部未填：给出结构化缺失清单，且不产生任何命中。
    const allMissing = evaluateSample(current, syncSampleInputs(current.fields, {}));
    expect(allMissing.valid).toBe(false);
    expect(allMissing.matchedRules).toEqual([]);
    expect(allMissing.winner).toBeUndefined();
    expect(allMissing.missingFieldIds).toEqual(['amount', 'tier', 'active']);
    expect(allMissing.errors).toEqual(['请填写“金额”', '请填写“等级”', '请填写“启用”']);
    // 已填但越界属于无效输入，而不是未填。
    const outOfRange = evaluateSample(current, { amount: 2000, tier: 'basic', active: false });
    expect(outOfRange.valid).toBe(false);
    expect(outOfRange.missingFieldIds).toEqual([]);
    expect(outOfRange.invalidFieldIds).toEqual(['amount']);
  });

  it('never backfills defaults silently, and only fills explicitly on request', () => {
    const fields: RuleField[] = [
      { id: 'n', name: '数值', type: 'number', min: 5, max: 10 },
      { id: 'e', name: '枚举', type: 'enum', enumValues: ['甲', '乙'] },
      { id: 'b', name: '布尔', type: 'boolean' },
    ];
    // 同步字段集合后，新字段保持未填。
    const synced = syncSampleInputs(fields, { n: 7, gone: 1 });
    expect(synced).toEqual({ n: 7, e: '', b: '' });
    expect(findMissingFieldIds(fields, synced)).toEqual(['e', 'b']);
    // 显式补全只动未填字段，并回报补了哪些。
    const filled = fillMissingSample(fields, synced);
    expect(filled.values).toEqual({ n: 7, e: '甲', b: false });
    expect(filled.filledFieldIds).toEqual(['e', 'b']);
    // 没有选项的枚举没有可用默认值，既不补也不算可补全目标。
    const optionless: RuleField = { id: 'empty-enum', name: '空枚举', type: 'enum', enumValues: [] };
    expect(defaultValueForField(optionless)).toBe('');
    expect(findMissingFieldIds([optionless], { 'empty-enum': '' })).toEqual([]);
    expect(fillMissingSample([optionless], { 'empty-enum': '' }).filledFieldIds).toEqual([]);
  });

  it('syncs sample inputs when fields are added or removed', () => {
    const fields: RuleField[] = [
      { id: 'keep', name: '保留', type: 'number', min: 0, max: 1 },
      { id: 'drop', name: '删除', type: 'boolean' },
    ];
    const synced = syncSampleInputs([fields[0]], { keep: 1, drop: true });
    expect(synced).toEqual({ keep: 1 });
    expect('drop' in synced).toBe(false);
  });
});
