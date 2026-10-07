import { isSampleBlank } from '../../domain/conditionEvaluator';
import type { RuleField, ScalarValue } from '../../models/ruleModel';
import type { WorkspaceState } from '../../viewmodels/workspaceViewModel';
import type { SamplesViewModel } from './samplesViewModel';

interface SamplesViewProps { state: WorkspaceState; viewModel: SamplesViewModel }

export function SamplesView({ state, viewModel }: SamplesViewProps) {
  const project = state.project;
  const evaluation = state.sampleEvaluation;
  const fields = project?.fields ?? [];
  const rules = project?.rules ?? [];
  const autoFilled = new Set(state.autoFilledFieldIds);
  const values = project?.sampleInputs ?? {};
  const missingFieldIds = fields.filter((field) => isSampleBlank(values[field.id])).map((field) => field.id);
  const missingSet = new Set(evaluation?.missingFieldIds ?? []);
  const invalidSet = new Set(evaluation?.invalidFieldIds ?? []);
  const fillableCount = viewModel.missingFieldIds().length;
  const fieldName = (fieldId: string) => fields.find((field) => field.id === fieldId)?.name ?? fieldId;
  const invalidIssues = evaluation?.issues.filter((issue) => issue.kind === 'invalid') ?? [];
  const pillState = evaluation?.valid
    ? 'state-pill state-good'
    : evaluation && (evaluation.missingFieldIds.length || evaluation.invalidFieldIds.length)
      ? 'state-pill state-amber'
      : 'state-pill state-neutral';
  const pillText = evaluation?.valid ? '已求值' : evaluation?.missingFieldIds.length ? `${evaluation.missingFieldIds.length} 项未填写` : evaluation?.invalidFieldIds.length ? '输入无效' : '等待输入';
  return (
    <section className="module-page">
      <div className="page-heading"><div><span className="eyebrow">模块 03 / 输入推演</span><h1>样例试验区</h1><p>输入一组具体值，观察所有命中规则及最终采用的结果。未填写的字段不会参与命中推演。</p></div>
        <div className="button-row">
          <button className="button button-subtle" disabled={!fields.length || fillableCount === 0} onClick={() => viewModel.fillMissing()} title="把未填字段按各自最小值、第一个选项或否补全">⤓ 补全未填项{fillableCount > 0 ? `（${fillableCount}）` : ''}</button>
          <button className="button button-primary" disabled={!fields.length || !rules.length} onClick={() => viewModel.evaluate()}>运行样例 <span>↗</span></button>
        </div>
      </div>
      {!fields.length && <div className="inline-issue">定义字段后即可输入样例。</div>}
      <div className="sample-layout">
        <section className="sample-input-card card-surface">
          <header className="panel-heading"><div><span className="eyebrow">INPUT VALUES</span><h2>测试输入</h2></div><span className="count-chip">{fields.length - missingFieldIds.length} / {fields.length} 已填写</span></header>
          {missingFieldIds.length > 0 && <div className="sample-missing-banner"><strong>{missingFieldIds.length} 个字段尚未填写</strong><span>系统不会自动补值。可逐个填写，或点击右上角“补全未填项”一次性补成默认值。</span></div>}
          <div className="sample-fields">{fields.map((field) => {
            const blank = isSampleBlank(values[field.id]);
            return <SampleField key={field.id} field={field} value={values[field.id]} autoFilled={!blank && autoFilled.has(field.id)} stateClass={blank ? 'is-missing' : invalidSet.has(field.id) ? 'is-invalid' : ''} message={blank ? '未填写' : invalidSet.has(field.id) ? evaluation?.issues.find((issue) => issue.fieldId === field.id && issue.kind === 'invalid')?.message : ''} onChange={(value) => viewModel.setValue(field.id, value)} />;
          })}</div>
          <div className="sample-tip"><span>i</span><p>样例输入会随项目保存。空白代表“未填写”，与手动填了最小值或“否”不同；带“默认补全”标记的值来自一键补全，修改后即视为你自己的输入。</p></div>
        </section>

        <section className="sample-output-card card-surface">
          <header className="panel-heading"><div><span className="eyebrow">MATCH TRACE</span><h2>命中路径</h2></div><span className={pillState}><i />{pillText}</span></header>
          {evaluation && (evaluation.missingFieldIds.length > 0 || evaluation.invalidFieldIds.length > 0) ? (
            <div className="sample-errors">
              {evaluation.missingFieldIds.length > 0 && <div className="sample-error-group sample-error-missing">
                <strong>有 {evaluation.missingFieldIds.length} 个字段未填写，本次不进行命中判断</strong>
                <p>未填字段：{evaluation.missingFieldIds.map(fieldName).join('、')}</p>
                <button className="text-button" disabled={fillableCount === 0} onClick={() => viewModel.fillMissing()}>补全未填项后可立即运行{fillableCount > 0 ? `（剩 ${fillableCount} 项）` : ''}</button>
              </div>}
              {invalidIssues.length > 0 && <div className="sample-error-group sample-error-invalid">
                <strong>已填写但不合法的输入</strong>
                {invalidIssues.map((issue) => <p key={`${issue.fieldId}-${issue.message}`}>! {issue.message}</p>)}
              </div>}
            </div>
          ) : evaluation?.valid && evaluation.matchedRules.length ? <>
            <div className="winner-result"><div className="winner-label"><span>最终结果</span><b>优先级 {evaluation.winner?.priority}</b></div><strong>{evaluation.winner?.result || '此规则尚未填写结果'}</strong><span className="winner-rule">由 {evaluation.winner?.name} 命中</span></div>
            <div className="trace-heading"><span>匹配顺序</span><span>{evaluation.matchedRules.length} 条规则命中</span></div>
            <ol className="match-trace">{evaluation.matchedRules.map((rule, index) => <li className={index === 0 ? 'trace-winner' : ''} key={rule.id}><span className="trace-dot">{index === 0 ? '✓' : index + 1}</span><div><strong>{rule.name}</strong><span>{rule.result || '未填写结果'}</span></div><b>P{rule.priority}</b></li>)}</ol>
          </> : evaluation?.valid ? <div className="no-match-state"><div>∅</div><strong>没有规则命中</strong><p>这组输入落在当前规则集合未覆盖的区域。</p></div>
            : <div className="no-match-state"><div>◌</div><strong>等待一组合法输入</strong><p>填写全部字段后运行，命中结果会显示在这里。</p></div>}
          {evaluation?.valid && evaluation.matchedRules.length > 1 && <div className="trace-note">多条规则同时命中。优先级最高者作为最终结果，同优先级按列表顺序决胜。</div>}
          {missingSet.size > 0 && <div className="trace-note trace-note-warn">未填写的字段（{[...missingSet].map(fieldName).join('、')}）没有被当作任何具体值，这组输入不算合法推演。</div>}
        </section>
      </div>
    </section>
  );
}

interface SampleFieldProps { field: RuleField; value: ScalarValue | '' | undefined; onChange: (value: ScalarValue | '') => void; autoFilled: boolean; stateClass: '' | 'is-missing' | 'is-invalid'; message?: string }

function SampleField({ field, value, onChange, autoFilled, stateClass, message }: SampleFieldProps) {
  const blank = stateClass === 'is-missing';
  return <label className={`sample-field sample-field-${stateClass || 'filled'}`}>
    <span><span className="sample-field-title">{field.name}</span>{autoFilled
      ? <em className="sample-state-tag tag-autofill">默认补全</em>
      : blank
        ? <em className="sample-state-tag tag-missing">未填写</em>
        : <em className="sample-state-tag tag-filled">已填写</em>}</span>
    <small>{field.type === 'number' ? `${field.min}–${field.max}` : field.type === 'enum' ? '枚举值' : '是 / 否'}</small>
    {field.type === 'number' ? <input type="number" min={field.min} max={field.max} className={stateClass} placeholder="未填写" value={typeof value === 'number' ? value : ''} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} /> : field.type === 'enum' ? <select className={stateClass} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}><option value="">请选择（未填写）</option>{(field.enumValues ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select> : <select className={stateClass} value={typeof value === 'boolean' ? String(value) : ''} onChange={(event) => onChange(event.target.value === '' ? '' : event.target.value === 'true')}><option value="">请选择（未填写）</option><option value="true">是</option><option value="false">否</option></select>}
    {message && stateClass === 'is-invalid' && <small className="sample-field-message">{message}</small>}
  </label>;
}
