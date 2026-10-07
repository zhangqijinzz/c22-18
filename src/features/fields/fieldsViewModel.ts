import { sanitizeSampleInputs } from '../../domain/sampleInputs';
import type { FieldType, RuleCondition, RuleField, SampleInput, SampleInputSources } from '../../models/ruleModel';
import type { WorkspacePort } from '../../viewmodels/workspacePort';

export class FieldsViewModel {
  constructor(private readonly workspace: WorkspacePort) {}

  addField(type: FieldType): void {
    const project = this.workspace.getSnapshot().project;
    if (!project) return;
    const ordinal = project.fields.length + 1;
    const field: RuleField = type === 'number'
      ? { id: makeId('field'), name: `数值字段 ${ordinal}`, type, min: 0, max: 1000 }
      : type === 'enum'
        ? { id: makeId('field'), name: `枚举字段 ${ordinal}`, type, enumValues: ['选项 A', '选项 B'] }
        : { id: makeId('field'), name: `布尔字段 ${ordinal}`, type };
    // 新字段保持“未填写”，不悄悄替用户补入最小值/首选项/否。
    const fields = [...project.fields, field];
    const sampleInputs = { ...project.sampleInputs, [field.id]: '' as const };
    this.workspace.commitProject({
      ...project,
      fields,
      sampleInputs: sanitizeSampleInputs(sampleInputs, fields).sampleInputs,
      sampleInputSources: preserveSources(project.sampleInputSources, fields, sampleInputs),
    }, `已添加字段“${field.name}”，请在样例试验区填写或显式补全`);
  }

  updateField(fieldId: string, updates: Partial<RuleField>): void {
    const project = this.workspace.getSnapshot().project;
    if (!project) return;
    const fields = project.fields.map((field) => field.id === fieldId ? { ...field, ...updates } : field);
    // 范围/选项调整后，与新定义不兼容的样例值归为未填写，而不是静默保留或替用户改值。
    const sanitized = sanitizeSampleInputs(project.sampleInputs, fields);
    this.workspace.commitProject(
      { ...project, fields, sampleInputs: sanitized.sampleInputs, sampleInputSources: preserveSources(project.sampleInputSources, fields, sanitized.sampleInputs) },
      '字段已更新，不兼容的样例值已标记为未填写，检查结果将自动刷新',
    );
  }

  removeField(fieldId: string): boolean {
    const project = this.workspace.getSnapshot().project;
    const field = project?.fields.find((candidate) => candidate.id === fieldId);
    if (!project || !field) return false;
    const references = project.rules.filter((rule) => referencesField(rule.conditions, fieldId)).map((rule) => rule.name);
    if (references.length) {
      this.workspace.updateView({ notice: `无法删除“${field.name}”：仍被 ${references.join('、')} 引用。请先移除这些规则条件。` });
      return false;
    }
    const fields = project.fields.filter((candidate) => candidate.id !== fieldId);
    const { sampleInputs } = sanitizeSampleInputs(project.sampleInputs, fields);
    this.workspace.commitProject({ ...project, fields, sampleInputs, sampleInputSources: preserveSources(project.sampleInputSources, fields, sampleInputs) }, `已删除字段“${field.name}”`);
    return true;
  }

  isReferenced(fieldId: string): boolean {
    const project = this.workspace.getSnapshot().project;
    return project?.rules.some((rule) => referencesField(rule.conditions, fieldId)) ?? false;
  }
}

/** 清洗后仍保留的已填字段沿用其原有来源（user/auto），新字段及未填字段不带来源。 */
function preserveSources(
  previous: SampleInputSources,
  fields: RuleField[],
  sampleInputs: SampleInput,
): SampleInputSources {
  const sources: SampleInputSources = {};
  for (const field of fields) {
    const value = sampleInputs[field.id];
    if (value !== '' && value !== undefined) sources[field.id] = previous[field.id] ?? 'user';
  }
  return sources;
}

function referencesField(condition: RuleCondition, fieldId: string): boolean {
  return condition.kind === 'group'
    ? condition.conditions.some((child) => referencesField(child, fieldId))
    : condition.fieldId === fieldId;
}

function makeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
