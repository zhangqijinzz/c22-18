import { describe, expect, it } from 'vitest';
import { evaluateSample } from '../domain/conditionEvaluator';
import { fillMissingSampleInputs, sanitizeSampleInputs } from '../domain/sampleInputs';
import type { BusinessRule, RuleField, RuleProject } from '../models/ruleModel';

const amount: RuleField = { id: 'amount', name: '金额', type: 'number', min: 0, max: 1000 };
const tier: RuleField = { id: 'tier', name: '等级', type: 'enum', enumValues: ['basic', 'gold'] };
const active: RuleField = { id: 'active', name: '启用', type: 'boolean' };
const fields = [amount, tier, active];

function project(rules: BusinessRule[] = [], sampleInputs: RuleProject['sampleInputs'] = {}): RuleProject {
  return { id: 'p', title: '测试项目', fields, rules, sampleInputs, sampleInputSources: {}, versions: [], updatedAt: 1 };
}

describe('样例三态：未填写 / 本人填写 / 系统补入', () => {
  it('清洗不会注入默认值，并报告未填写字段', () => {
    const result = sanitizeSampleInputs({ amount: 10, amount2: 1 }, fields);
    expect(result.sampleInputs).toEqual({ amount: 10, tier: '', active: '' });
    expect(result.sources).toEqual({ amount: 'user' });
    expect(result.missingFieldIds).toEqual(['tier', 'active']);
  });

  it('显式补全只填充未填写字段并标记 auto，已填写值不动', () => {
    const result = fillMissingSampleInputs(fields, { amount: 10, tier: '', active: '' }, { amount: 'user' });
    expect(result.sampleInputs).toEqual({ amount: 10, tier: 'basic', active: false });
    expect(result.sources).toEqual({ amount: 'user', tier: 'auto', active: 'auto' });
    expect(result.filledFieldIds).toEqual(['tier', 'active']);
    // 再次补全不应改动任何字段
    expect(fillMissingSampleInputs(fields, result.sampleInputs, result.sources).filledFieldIds).toEqual([]);
  });

  it('枚举选项被移除后，原来系统/用户补入的值都归为未填写', () => {
    const changed: RuleField[] = [amount, { ...tier, enumValues: ['platinum'] }, active];
    const result = sanitizeSampleInputs({ amount: 10, tier: 'gold', active: false }, changed);
    expect(result.sampleInputs.tier).toBe('');
    expect(result.missingFieldIds).toEqual(['tier']);
  });

  it('求值：未填写字段列入 missingFieldIds，且不返回任何命中规则', () => {
    const rule: BusinessRule = {
      id: 'gold', name: '金卡', priority: 10, result: '折扣',
      conditions: { kind: 'group', operator: 'and', conditions: [{ kind: 'predicate', fieldId: 'tier', operator: 'eq', value: 'gold' }] },
    };
    // 即便 active=false（补全默认值）恰好让某条只看 active 的规则"不命中"，
    // 未填写也必须整体判为无效，而不是算一组合法输入。
    const result = evaluateSample(project([rule]), { amount: 10, tier: 'gold', active: '' });
    expect(result.valid).toBe(false);
    expect(result.missingFieldIds).toEqual(['active']);
    expect(result.matchedRules).toEqual([]);
  });
});
