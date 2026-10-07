import { evaluateSample } from '../../domain/conditionEvaluator';
import { clearSampleInputs, fillMissingSampleInputs } from '../../domain/sampleInputs';
import type { RuleProject, SampleInput, SampleInputSources, ScalarValue } from '../../models/ruleModel';
import type { WorkspacePort } from '../../viewmodels/workspacePort';

export class SamplesViewModel {
  constructor(private readonly workspace: WorkspacePort) {}

  /** 用户手动修改一律记为本人填写，即便该值恰好等于最小值/首个选项/否。 */
  setValue(fieldId: string, value: ScalarValue | ''): void {
    const project = this.currentProject();
    if (!project) return;
    const sampleInputs: SampleInput = { ...project.sampleInputs, [fieldId]: value };
    const sampleInputSources: SampleInputSources = { ...project.sampleInputSources };
    if (value === '') delete sampleInputSources[fieldId];
    else sampleInputSources[fieldId] = 'user';
    this.workspace.commitProject({ ...project, sampleInputs, sampleInputSources }, '样例已更新', { recheck: false });
  }

  /** 显式补全：把当前未填写的字段填入默认值，并在界面上标记为系统补入。 */
  fillMissing(): void {
    const project = this.currentProject();
    if (!project) return;
    const result = fillMissingSampleInputs(project.fields, project.sampleInputs, project.sampleInputSources);
    if (!result.filledFieldIds.length) {
      this.workspace.updateView({ notice: '没有需要补全的未填写字段' });
      return;
    }
    const names = result.filledFieldIds
      .map((fieldId) => project.fields.find((field) => field.id === fieldId)?.name)
      .filter(Boolean)
      .join('、');
    this.workspace.commitProject(
      { ...project, sampleInputs: result.sampleInputs, sampleInputSources: result.sources },
      `已按默认规则补全未填写字段：${names}（标记为系统补入，可逐个修改）。确认后请重新运行样例。`,
      { recheck: false },
    );
  }

  /** 清空全部输入，全部字段回到未填写状态。 */
  clearAll(): void {
    const project = this.currentProject();
    if (!project) return;
    const { sampleInputs, sources } = clearSampleInputs(project.fields);
    this.workspace.commitProject({ ...project, sampleInputs, sampleInputSources: sources }, '已清空全部样例输入', { recheck: false });
  }

  evaluate(): void {
    const project = this.currentProject();
    if (!project) return;
    const evaluation = evaluateSample(project, project.sampleInputs);
    const notice = evaluation.valid
      ? '样例求值完成'
      : evaluation.missingFieldIds.length
        ? '样例存在未填写字段，未参与命中判断'
        : '样例包含无效输入';
    this.workspace.updateView({ sampleEvaluation: evaluation, notice });
  }

  private currentProject(): RuleProject | null {
    return this.workspace.getSnapshot().project;
  }
}
