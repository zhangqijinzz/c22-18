import { describe, expect, it } from 'vitest';
import { RuleRepository } from '../repositories/ruleRepository';
import type { WorkspaceDocument } from '../models/ruleModel';

class FakeStorage {
  constructor(private readonly value: unknown) {}
  async read(): Promise<unknown> { return this.value; }
  readFallback(): unknown { return null; }
  async write(): Promise<void> { /* no-op */ }
}

function legacyDocument(sampleInputs: unknown): WorkspaceDocument {
  // 刻意模拟不包含 sampleInputSources 的旧版持久化数据
  const legacy: unknown = {
    schemaVersion: 1,
    activeProjectId: 'p1',
    projects: [{
      id: 'p1',
      title: '旧项目',
      updatedAt: 1,
      fields: [
        { id: 'amount', name: '金额', type: 'number', min: 10, max: 100 },
        { id: 'level', name: '等级', type: 'enum', enumValues: ['银卡', '金卡'] },
        { id: 'active', name: '启用', type: 'boolean' },
      ],
      rules: [],
      sampleInputs,
      versions: [],
    }],
  };
  return legacy as WorkspaceDocument;
}

describe('RuleRepository 恢复旧数据', () => {
  it('缺少字段键时保持未填写，不补入最小值、第一个选项或否', async () => {
    const document = legacyDocument({ amount: 50 });
    const repository = new RuleRepository(new FakeStorage(document) as never);
    const decoded = await repository.load();
    const project = decoded?.projects[0];
    expect(project).toBeDefined();
    expect(project?.sampleInputs).toEqual({ amount: 50, level: '', active: '' });
    expect(project?.sampleInputSources).toEqual({ amount: 'user' });
  });

  it('类型不匹配或枚举选项已删除的值归为未填写，而不是静默保留', async () => {
    // amount 给了布尔；level 引用了已不存在的选项；active 给了字符串
    const document = legacyDocument({ amount: true, level: '普卡', active: '否' });
    const repository = new RuleRepository(new FakeStorage(document) as never);
    const project = (await repository.load())?.projects[0];
    expect(project?.sampleInputs).toEqual({ amount: '', level: '', active: '' });
    expect(project?.sampleInputSources).toEqual({});
  });

  it('删除字段残留的键不会再被带入项目', async () => {
    const document = legacyDocument({ amount: 20, level: '金卡', active: false, ghost: '残留' });
    const repository = new RuleRepository(new FakeStorage(document) as never);
    const project = (await repository.load())?.projects[0];
    expect(project?.sampleInputs).not.toHaveProperty('ghost');
    expect(project?.sampleInputSources).not.toHaveProperty('ghost');
  });
});
