import { describe, expect, it } from 'vitest';
import { FieldsViewModel } from '../features/fields/fieldsViewModel';
import { RulesViewModel } from '../features/rules/rulesViewModel';
import { SamplesViewModel } from '../features/samples/samplesViewModel';
import { RuleWorkspaceViewModel } from '../viewmodels/workspaceViewModel';
import type { RuleProject, WorkspaceDocument } from '../models/ruleModel';

class MemoryRepository {
  document: WorkspaceDocument | null = null;
  async load() { return this.document ? structuredClone(this.document) : null; }
  async save(document: WorkspaceDocument) { this.document = structuredClone(document); }
}

class FakeChecker {
  run() { return { promise: Promise.resolve({ checkedCases: 1, coveredCases: 1, coveragePercent: 100, overlaps: [], unreachableRuleIds: [], shadowedRuleIds: [], uncoveredExamples: [], truncated: false }), cancel() {} }; }
}

async function setup() {
  const workspace = new RuleWorkspaceViewModel(new MemoryRepository(), new FakeChecker());
  await workspace.start();
  return {
    workspace,
    fields: new FieldsViewModel(workspace),
    rules: new RulesViewModel(workspace),
    samples: new SamplesViewModel(workspace),
  };
}

describe('feature ViewModels', () => {
  it('adds typed fields, builds a rule, protects referenced fields, and evaluates a sample', async () => {
    const { workspace, fields, rules, samples } = await setup();
    fields.addField('boolean');
    rules.addRule();
    const addedField = workspace.getSnapshot().project?.fields.at(-1);
    expect(addedField?.type).toBe('boolean');
    expect(fields.removeField('member-level')).toBe(false);
    expect(workspace.getSnapshot().notice).toContain('仍被');
    const project = workspace.getSnapshot().project;
    expect(project).toBeDefined();
    const boolField = project?.fields.at(-1);
    if (boolField) samples.setValue(boolField.id, true);
    samples.evaluate();
    expect(workspace.getSnapshot().sampleEvaluation?.valid).toBe(true);
    workspace.dispose();
  });

  it('新增字段默认是未填写；显式补全后标记为 auto，用户一改即变为 user', async () => {
    const { workspace, fields, samples } = await setup();
    fields.addField('number');
    const project1 = workspace.getSnapshot().project as RuleProject;
    const newField = project1.fields.find((field) => field.name === '数值字段 4');
    expect(newField).toBeDefined();
    expect(project1.sampleInputs[newField!.id]).toBe('');
    expect(project1.sampleInputSources[newField!.id]).toBeUndefined();

    samples.fillMissing();
    const project2 = workspace.getSnapshot().project as RuleProject;
    expect(project2.sampleInputs[newField!.id]).toBe(0);
    expect(project2.sampleInputSources[newField!.id]).toBe('auto');
    // 补全本身不触发求值
    expect(workspace.getSnapshot().sampleEvaluation).toBeNull();

    // 用户手动改成同值以外的值 → user
    samples.setValue(newField!.id, 0);
    const project3 = workspace.getSnapshot().project as RuleProject;
    expect(project3.sampleInputSources[newField!.id]).toBe('user');
    workspace.dispose();
  });

  it('字段枚举选项收窄后，不兼容的样例值归为未填写', async () => {
    const { workspace, fields } = await setup();
    const level = (workspace.getSnapshot().project as RuleProject).fields[0];
    fields.updateField(level.id, { enumValues: ['普通会员', '银卡会员'] });
    const project = workspace.getSnapshot().project as RuleProject;
    expect(project.sampleInputs['member-level']).toBe('');
    expect(project.sampleInputSources['member-level']).toBeUndefined();
    workspace.dispose();
  });
});
