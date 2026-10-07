import type { RuleField } from '../../models/ruleModel';
import type { WorkspaceState } from '../../viewmodels/workspaceViewModel';
import type { SamplesViewModel } from './samplesViewModel';

interface SamplesViewProps { state: WorkspaceState; viewModel: SamplesViewModel }

export function SamplesView({ state, viewModel }: SamplesViewProps) {
  const project = state.project;
  const evaluation = state.sampleEvaluation;
  const fields = project?.fields ?? [];
  const rules = project?.rules ?? [];
  const missingFields = fields.filter((field) => {
    const value = project?.sampleInputs[field.id];
    return value === undefined || value === '';
  });
  const autoCount = fields.filter((field) => project?.sampleInputSources[field.id] === 'auto').length;
  return (
    <section className="module-page">
      <div className="page-heading"><div><span className="eyebrow">模块 03 / 输入推演</span><h1>样例试验区</h1><p>输入一组具体值，观察所有命中规则及最终采用的结果。未填写字段不会算作合法输入。</p></div>
        <div className="button-row">
          <button className="button button-subtle" disabled={!fields.length || missingFields.length === 0} onClick={() => viewModel.fillMissing()} title="把未填写字段按最小值、第一个选项或否补入，并标记为系统补入">补全未填写（{missingFields.length}）</button>
          <button className="button button-quiet" disabled={!fields.length} onClick={() => viewModel.clearAll()}>清空</button>
          <button className="button button-primary" disabled={!fields.length || !rules.length} onClick={() => viewModel.evaluate()}>运行样例 <span>↗</span></button>
        </div>
      </div>
      {!fields.length && <div className="inline-issue">定义字段后即可输入样例。</div>}
      {fields.length > 0 && (missingFields.length > 0 || autoCount > 0) && <div className="sample-status-row">
        {missingFields.length > 0 && <span className="sample-status-chip status-missing"><i />{missingFields.length} 个字段未填写：{missingFields.map((field) => field.name).join('、')}</span>}
        {autoCount > 0 && <span className="sample-status-chip status-auto"><i />{autoCount} 个值为系统补入（可直接修改为本人填写）</span>}
      </div>}
      <div className="sample-layout">
        <section className="sample-input-card card-surface">
          <header className="panel-heading"><div><span className="eyebrow">INPUT VALUES</span><h2>测试输入</h2></div><span className="count-chip">{fields.length} 个字段</span></header>
          <div className="sample-fields">{fields.map((field) => <SampleField key={field.id} field={field} value={project?.sampleInputs[field.id]} source={project?.sampleInputSources[field.id]} onChange={(value) => viewModel.setValue(field.id, value)} />)}</div>
          <div className="sample-tip"><span>i</span><p>未填写（留空或显示“请选择”）与手动填了最小值、否不同；只有点击“补全未填写”才会由系统补入默认值，并以“系统补入”标记区分。样例随项目保存。</p></div>
        </section>

        <section className="sample-output-card card-surface">
          <header className="panel-heading"><div><span className="eyebrow">MATCH TRACE</span><h2>命中路径</h2></div>{evaluation ? <span className={evaluation.valid ? 'state-pill state-good' : 'state-pill state-warn'}><i />{evaluation.valid ? '已求值' : '输入不完整'}</span> : <span className="state-pill state-neutral"><i />等待运行</span>}</header>
          {!evaluation && <div className="sample-pending"><div>◌</div><strong>尚未对当前输入求值</strong><p>新增、删除或修改字段/样例后需要重新点击“运行样例”；未填写的字段不会被算作一组合法输入。</p></div>}
          {evaluation && evaluation.missingFieldIds.length > 0 && <div className="sample-missing-banner">
            <strong>有 {evaluation.missingFieldIds.length} 个字段未填写，本次未进行命中判断</strong>
            <ul>{evaluation.missingFieldIds.map((fieldId) => {
              const field = fields.find((candidate) => candidate.id === fieldId);
              return <li key={fieldId}>! {field ? `请填写“${field.name}”` : fieldId}</li>;
            })}</ul>
            <button className="text-button" onClick={() => viewModel.fillMissing()}>按默认规则补全这些字段 →</button>
          </div>}
          {evaluation && !evaluation.missingFieldIds.length && !evaluation.valid && <div className="sample-errors"><strong>输入包含无效值</strong>{evaluation.errors.map((error) => <p key={error}>! {error}</p>)}</div>}
          {evaluation?.valid && evaluation.matchedRules.length ? <>
            <div className="winner-result"><div className="winner-label"><span>最终结果</span><b>优先级 {evaluation.winner?.priority}</b></div><strong>{evaluation.winner?.result || '此规则尚未填写结果'}</strong><span className="winner-rule">由 {evaluation.winner?.name} 命中</span></div>
            <div className="trace-heading"><span>匹配顺序</span><span>{evaluation.matchedRules.length} 条规则命中</span></div>
            <ol className="match-trace">{evaluation.matchedRules.map((rule, index) => <li className={index === 0 ? 'trace-winner' : ''} key={rule.id}><span className="trace-dot">{index === 0 ? '✓' : index + 1}</span><div><strong>{rule.name}</strong><span>{rule.result || '未填写结果'}</span></div><b>P{rule.priority}</b></li>)}</ol>
          </> : null}
          {evaluation?.valid && evaluation.matchedRules.length === 0 && <div className="no-match-state"><div>∅</div><strong>没有规则命中</strong><p>这组输入落在当前规则集合未覆盖的区域。</p></div>}
          {evaluation?.valid && evaluation.matchedRules.length > 1 && <div className="trace-note">多条规则同时命中。优先级最高者作为最终结果，同优先级按列表顺序决胜。</div>}
        </section>
      </div>
    </section>
  );
}

interface SampleFieldProps { field: RuleField; value: string | number | boolean | undefined; source?: 'user' | 'auto'; onChange: (value: string | number | boolean | '') => void }

function SampleField({ field, value, source, onChange }: SampleFieldProps) {
  const unfilled = value === undefined || value === '';
  return <label className={`sample-field${unfilled ? ' is-unfilled' : source === 'auto' ? ' is-auto' : ''}`}>
    <span>{field.name}<small>{field.type === 'number' ? `${field.min}–${field.max}` : field.type === 'enum' ? '枚举值' : '是 / 否'} · {unfilled ? '未填写' : source === 'auto' ? '系统补入' : '本人填写'}</small></span>
    {field.type === 'number' ? <input type="number" min={field.min} max={field.max} value={typeof value === 'number' ? value : ''} placeholder="未填写" onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} /> : field.type === 'enum' ? <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}><option value="">请选择（未填写）</option>{(field.enumValues ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select> : <select value={typeof value === 'boolean' ? String(value) : ''} onChange={(event) => onChange(event.target.value === '' ? '' : event.target.value === 'true')}><option value="">请选择（未填写）</option><option value="true">是</option><option value="false">否</option></select>}
  </label>;
}
