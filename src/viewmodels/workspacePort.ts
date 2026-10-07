import type { ModuleId, RuleProject } from '../models/ruleModel';
import type { WorkspaceState } from './workspaceViewModel';

export interface CommitProjectOptions {
  recheck?: boolean;
  /** 本次提交后仍处于“系统默认补全”状态的字段；未传则沿用当前集合（按现存字段裁剪）。 */
  autoFilledFieldIds?: string[];
}

export interface WorkspacePort {
  getSnapshot(): WorkspaceState;
  commitProject(project: RuleProject, notice?: string, options?: CommitProjectOptions): boolean;
  updateView(patch: Partial<WorkspaceState>): void;
  navigate(module: ModuleId): void;
  selectRule(ruleId?: string): void;
}
