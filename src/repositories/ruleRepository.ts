import type { BusinessRule, RuleField, RuleProject, RuleVersion, SampleInput, ScalarValue, WorkspaceDocument } from '../models/ruleModel';
import { ProjectStorageService } from '../services/projectStorageService';

export class RuleRepository {
  constructor(private readonly storage: ProjectStorageService) {}

  async load(): Promise<WorkspaceDocument | null> {
    const indexedDbValue = await this.storage.read();
    return decodeWorkspace(indexedDbValue) ?? decodeWorkspace(this.storage.readFallback());
  }

  save(document: WorkspaceDocument): Promise<void> {
    return this.storage.write(document);
  }
}

function decodeWorkspace(value: unknown): WorkspaceDocument | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.projects) || typeof value.activeProjectId !== 'string') return null;
  const projects: RuleProject[] = [];
  for (const valueProject of value.projects) {
    const project = decodeProject(valueProject);
    if (!project) return null;
    projects.push(project);
  }
  if (!projects.length || !projects.some((project) => project.id === value.activeProjectId)) return null;
  return { schemaVersion: 1, projects, activeProjectId: value.activeProjectId };
}

function decodeProject(value: unknown): RuleProject | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || !Array.isArray(value.fields) || !Array.isArray(value.rules) || typeof value.updatedAt !== 'number') return null;
  const fields = value.fields.filter(isRuleField);
  const rules = value.rules.filter(isBusinessRule);
  if (fields.length !== value.fields.length || rules.length !== value.rules.length) return null;
  const versionsValue = Array.isArray(value.versions) ? value.versions : [];
  const versions = versionsValue.filter(isRuleVersion);
  if (versions.length !== versionsValue.length) return null;
  // 恢复旧数据时与字段增删走同一套规则：只保留当前字段且类型正确的值，
  // 缺失或类型不符一律按未填处理，绝不替用户补成最小值/首选项/否。
  const project: RuleProject = {
    id: value.id,
    title: value.title,
    fields,
    rules,
    sampleInputs: sanitizeSampleInputs(fields, isRecord(value.sampleInputs) ? value.sampleInputs : {}),
    versions: versions.map((version) => ({ ...version, sampleInputs: sanitizeSampleInputs(version.fields, version.sampleInputs) })),
    updatedAt: value.updatedAt,
  };
  if (typeof value.frozenVersionId === 'string') project.frozenVersionId = value.frozenVersionId;
  return project;
}

/**
 * 把持久化的样例输入对齐到字段集合：
 * - 已删除字段的遗留值丢弃；
 * - 缺失字段显式记为未填（''）；
 * - JS 类型与字段类型不符的值无法成为合法输入，按未填处理；
 * - 类型正确但越界/不在枚举内的值保留原样，交给求值标成无效输入。
 */
export function sanitizeSampleInputs(fields: RuleField[], raw: Record<string, unknown>): SampleInput {
  const next: SampleInput = {};
  for (const field of fields) {
    const candidate = raw[field.id];
    next[field.id] = isValueMatchingType(field, candidate) ? (candidate as ScalarValue) : '';
  }
  return next;
}

function isValueMatchingType(field: RuleField, value: unknown): boolean {
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (field.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string' && value !== '';
}

function isRuleField(value: unknown): value is RuleField {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && ['number', 'enum', 'boolean'].includes(String(value.type));
}

function isBusinessRule(value: unknown): value is BusinessRule {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.priority === 'number'
    && typeof value.result === 'string'
    && isConditionGroup(value.conditions);
}

function isRuleVersion(value: unknown): value is RuleVersion {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.savedAt === 'number'
    && typeof value.frozen === 'boolean'
    && Array.isArray(value.fields)
    && value.fields.every(isRuleField)
    && Array.isArray(value.rules)
    && value.rules.every(isBusinessRule)
    && isRecord(value.sampleInputs);
}

function isConditionGroup(value: unknown): value is BusinessRule['conditions'] {
  return isRecord(value)
    && value.kind === 'group'
    && (value.operator === 'and' || value.operator === 'or')
    && Array.isArray(value.conditions)
    && value.conditions.every(isCondition);
}

function isCondition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'group') return isConditionGroup(value);
  return value.kind === 'predicate'
    && typeof value.fieldId === 'string'
    && typeof value.operator === 'string'
    && ['eq', 'notEq', 'gt', 'gte', 'lt', 'lte', 'between', 'isTrue', 'isFalse'].includes(value.operator)
    && (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean' || isRecord(value.value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
