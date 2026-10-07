import { describe, expect, it } from 'vitest';
import { RuleRepository } from '../repositories/ruleRepository';
import type { WorkspaceDocument } from '../models/ruleModel';

class StaticStorage {
  constructor(private readonly value: unknown) {}
  async read(): Promise<unknown> { return this.value; }
  readFallback(): unknown { return null; }
  async write(): Promise<void> { return undefined; }
}

function baseDocument(sampleInputs: unknown): WorkspaceDocument {
  return {
    schemaVersion: 1,
    activeProjectId: 'p1',
    projects: [{
      id: 'p1', title: '旧项目', updatedAt: 1, fields: [
        { id: 'amount', name: '金额', type: 'number', min: 0, max: 100 },
        { id: 'level', name: '等级', type: 'enum', enumValues: ['银', '金'] },
        { id: 'flag', name: '标记', type: 'boolean' },
      ],
      rules: [], sampleInputs: sampleInputs as WorkspaceDocument['projects'][number]['sampleInputs'], versions: [],
    }],
  };
}

describe('RuleRepository 旧数据恢复', () => {
  it('不替用户补默认值：缺失字段保持未填，显式填过的值（包括 false / 最小值）原样保留', async () => {
    // 旧版应用静默补过的 false 与 0 是真实存下来的数据，予以保留；
    // 但 level 缺失时绝不补成第一个选项。
    const repository = new RuleRepository(new StaticStorage(baseDocument({ amount: 0, flag: false })) as unknown as ConstructorParameters<typeof RuleRepository>[0]);
    const decoded = await repository.load();
    expect(decoded?.projects[0].sampleInputs).toEqual({ amount: 0, level: '', flag: false });
  });

  it('sampleInputs 整个缺失时，全部字段按未填处理而不是 defaultSample', async () => {
    const document = baseDocument(undefined);
    delete (document.projects[0] as { sampleInputs?: unknown }).sampleInputs;
    const repository = new RuleRepository(new StaticStorage(document) as unknown as ConstructorParameters<typeof RuleRepository>[0]);
    const decoded = await repository.load();
    expect(decoded?.projects[0].sampleInputs).toEqual({ amount: '', level: '', flag: '' });
  });

  it('清洗类型不符和已删除字段的遗留值，但保留类型正确但越界的值交给求值判无效', async () => {
    const document = baseDocument({ amount: 999, level: '铜', flag: 'true', ghost: 'x' });
    const repository = new RuleRepository(new StaticStorage(document) as unknown as ConstructorParameters<typeof RuleRepository>[0]);
    const decoded = await repository.load();
    expect(decoded?.projects[0].sampleInputs).toEqual({ amount: 999, level: '铜', flag: '' });
  });
});
