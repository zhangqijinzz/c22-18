import { evaluateSample, fillMissingSample, findMissingFieldIds } from '../../domain/conditionEvaluator';
import type { RuleProject, SampleInput, ScalarValue } from '../../models/ruleModel';
import type { WorkspacePort } from '../../viewmodels/workspacePort';

export class SamplesViewModel {
  constructor(private readonly workspace: WorkspacePort) {}

  setValue(fieldId: string, value: ScalarValue | ''): void {
    const project = this.currentProject();
    if (!project) return;
    const sampleInputs: SampleInput = { ...project.sampleInputs, [fieldId]: value };
    // 用户一旦亲手修改某个字段，它就不再是“系统默认补全”的值。
    const autoFilledFieldIds = (this.workspace.getSnapshot().autoFilledFieldIds ?? []).filter((id) => id !== fieldId);
    this.workspace.commitProject({ ...project, sampleInputs }, '样例已更新', { recheck: false, autoFilledFieldIds });
  }

  /** 显式补全：必须由用户点击触发，补了哪些字段会在提示与界面标记里看得见。 */
  fillMissing(): void {
    const project = this.currentProject();
    if (!project) return;
    const { values: sampleInputs, filledFieldIds } = fillMissingSample(project.fields, project.sampleInputs);
    if (!filledFieldIds.length) {
      this.workspace.updateView({ notice: '没有需要补全的未填字段' });
      return;
    }
    const autoFilledFieldIds = [
      ...(this.workspace.getSnapshot().autoFilledFieldIds ?? []),
      ...filledFieldIds,
    ];
    const names = project.fields
      .filter((field) => filledFieldIds.includes(field.id))
      .map((field) => `“${field.name}”`)
      .join('、');
    this.workspace.commitProject(
      { ...project, sampleInputs },
      `已按字段默认值补全 ${filledFieldIds.length} 个未填项：${names}。这些值来自系统补全，你可以随时修改`,
      { recheck: false, autoFilledFieldIds },
    );
  }

  evaluate(): void {
    const project = this.currentProject();
    if (!project) return;
    const evaluation = evaluateSample(project, project.sampleInputs);
    const notice = evaluation.valid
      ? '样例求值完成'
      : evaluation.missingFieldIds.length
        ? `有 ${evaluation.missingFieldIds.length} 个字段未填写，不会作为合法输入参与命中推演；请手动填写或点击“补全未填项”`
        : '样例包含无效输入，请按提示修正';
    this.workspace.updateView({ sampleEvaluation: evaluation, notice });
  }

  missingFieldIds(): string[] {
    const project = this.currentProject();
    return project ? findMissingFieldIds(project.fields, project.sampleInputs) : [];
  }

  private currentProject(): RuleProject | null {
    return this.workspace.getSnapshot().project;
  }
}
