import { describe, expect, it } from 'vitest';
import { FieldsViewModel } from '../features/fields/fieldsViewModel';
import { RulesViewModel } from '../features/rules/rulesViewModel';
import { SamplesViewModel } from '../features/samples/samplesViewModel';
import { RuleWorkspaceViewModel } from '../viewmodels/workspaceViewModel';

class MemoryRepository {
  async load() { return null; }
  async save() { return undefined; }
}

class FakeChecker {
  run() { return { promise: Promise.resolve({ checkedCases: 1, coveredCases: 1, coveragePercent: 100, overlaps: [], unreachableRuleIds: [], shadowedRuleIds: [], uncoveredExamples: [], truncated: false }), cancel() {} }; }
}

describe('feature ViewModels', () => {
  it('adds typed fields, builds a rule, protects referenced fields, and evaluates a sample', async () => {
    const workspace = new RuleWorkspaceViewModel(new MemoryRepository(), new FakeChecker());
    await workspace.start();
    const fields = new FieldsViewModel(workspace);
    const rules = new RulesViewModel(workspace);
    const samples = new SamplesViewModel(workspace);
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

  it('keeps new fields unfilled, fills defaults only via explicit action, and flags missing inputs', async () => {
    const workspace = new RuleWorkspaceViewModel(new MemoryRepository(), new FakeChecker());
    await workspace.start();
    const fieldsVM = new FieldsViewModel(workspace);
    const samplesVM = new SamplesViewModel(workspace);
    fieldsVM.addField('number');
    const newField = workspace.getSnapshot().project?.fields.at(-1);
    expect(newField).toBeDefined();
    // 新增字段必须是未填，而不是被静默补成最小值。
    expect(workspace.getSnapshot().project?.sampleInputs[newField!.id]).toBe('');
    const evaluationBefore = workspace.getSnapshot().sampleEvaluation;
    expect(evaluationBefore?.valid).toBe(false);
    expect(evaluationBefore?.missingFieldIds).toContain(newField!.id);
    // 显式补全后才合法，且补过的字段带着标记。
    samplesVM.fillMissing();
    const afterFill = workspace.getSnapshot();
    expect(afterFill.sampleEvaluation?.valid).toBe(true);
    expect(afterFill.autoFilledFieldIds).toContain(newField!.id);
    expect(afterFill.project?.sampleInputs[newField!.id]).toBe(newField && (newField as { min: number }).min);
    expect(afterFill.notice).toContain('补全');
    // 用户手动改动后，默认补全标记消失。
    samplesVM.setValue(newField!.id, 333);
    expect(workspace.getSnapshot().autoFilledFieldIds).not.toContain(newField!.id);
    // 清空后重新进入未填状态，求值不再给有效结果。
    samplesVM.setValue(newField!.id, '');
    samplesVM.evaluate();
    expect(workspace.getSnapshot().sampleEvaluation?.valid).toBe(false);
    expect(workspace.getSnapshot().sampleEvaluation?.missingFieldIds).toContain(newField!.id);
    expect(workspace.getSnapshot().sampleEvaluation?.matchedRules).toEqual([]);
    workspace.dispose();
  });
});
