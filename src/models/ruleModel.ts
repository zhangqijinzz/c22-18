export type FieldType = 'number' | 'enum' | 'boolean';
export type ScalarValue = string | number | boolean;
export type ModuleId = 'fields' | 'rules' | 'samples' | 'inspection';

export interface RuleField {
  id: string;
  name: string;
  type: FieldType;
  enumValues?: string[];
  min?: number;
  max?: number;
}

export interface NumberRange {
  min: number;
  max: number;
}

export type PredicateCondition =
  | { kind: 'predicate'; fieldId: string; operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { kind: 'predicate'; fieldId: string; operator: 'between'; value: NumberRange }
  | { kind: 'predicate'; fieldId: string; operator: 'eq' | 'notEq'; value: string }
  | { kind: 'predicate'; fieldId: string; operator: 'isTrue' | 'isFalse'; value: boolean };

export interface ConditionGroup {
  kind: 'group';
  operator: 'and' | 'or';
  conditions: RuleCondition[];
}

export type RuleCondition = PredicateCondition | ConditionGroup;

export interface BusinessRule {
  id: string;
  name: string;
  conditions: ConditionGroup;
  priority: number;
  result: string;
}

export type SampleInput = Record<string, ScalarValue | ''>;
/** 样例值的来源：用户手动填写，或经“补全未填写”动作由系统填入的默认值。 */
export type SampleInputSource = 'user' | 'auto';
export type SampleInputSources = Record<string, SampleInputSource>;

export interface RuleVersion {
  id: string;
  name: string;
  savedAt: number;
  frozen: boolean;
  fields: RuleField[];
  rules: BusinessRule[];
  sampleInputs: SampleInput;
  sampleInputSources?: SampleInputSources;
}

export interface RuleProject {
  id: string;
  title: string;
  fields: RuleField[];
  rules: BusinessRule[];
  sampleInputs: SampleInput;
  sampleInputSources: SampleInputSources;
  versions: RuleVersion[];
  frozenVersionId?: string;
  updatedAt: number;
}

export interface WorkspaceDocument {
  schemaVersion: 1;
  projects: RuleProject[];
  activeProjectId: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  fieldId?: string;
  ruleId?: string;
}

export interface MatchWitness {
  values: SampleInput;
  ruleIds: string[];
}

export interface RuleOverlap {
  ruleAId: string;
  ruleBId: string;
  conflict: boolean;
  witness: SampleInput;
}

export interface RuleAnalysis {
  checkedCases: number;
  coveredCases: number;
  coveragePercent: number;
  overlaps: RuleOverlap[];
  unreachableRuleIds: string[];
  shadowedRuleIds: string[];
  uncoveredExamples: SampleInput[];
  truncated: boolean;
}

export interface SampleEvaluation {
  valid: boolean;
  errors: string[];
  /** 本次求值时未填写的字段；这些字段不会作为合法输入参与命中判断。 */
  missingFieldIds: string[];
  matchedRules: BusinessRule[];
  winner?: BusinessRule;
}

export interface DomainChecker {
  analyze(project: RuleProject): RuleAnalysis;
  validateProject(project: RuleProject): ValidationIssue[];
}

export const fieldLabel = (field: RuleField): string => field.name || '未命名字段';
