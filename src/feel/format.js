// a report in, the failure text out (spec 7.9). the text is what lands in the ci log, so it names
// the step, the check, the number and the culprit, and says so in lowercase. values that come from
// the page (paths, invokers, trace event names) pass through as the page and chromium wrote them
const f1 = (n) => String(Math.round(n * 10) / 10);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const CONT = ' '.repeat(13);
const label = (check) => check.padEnd(10);
const runValues = (v) => v.values.map((x) => `run ${x.run} ${f1(x.value)}`).join(', ');
const scriptsText = (scripts) => scripts.map((s) => `${s.invoker} ${s.source} ${f1(s.ms)}ms`).join(', ');

function runsLine(r) {
  if (r.runsPlanned === 1) return 'one run, strict';
  if (r.runsDone === 2 && r.runsPlanned >= 3) return 'runs 1 and 2 agree, run 3 skipped';
  if (r.runsDone === 3) return 'runs 1 and 2 disagreed, run 3 decided';
  return `${plural(r.runsDone, 'run')}`;
}

function envLine(e) {
  return `${e.chromium}${e.headlessShell ? ' headless shell' : ''}, ${e.platform}, ${e.viewport.width}x${e.viewport.height} @${e.dpr}x, vsync ${f1(e.interval)}ms, calibration ${Math.round(e.calibration)}ms, ${e.steady ? 'steady' : 'unsteady'}`;
}

function stepTitle(step) {
  if (step === null) return 'scenario';
  if (step.kind === 'load') return 'load (after first paint)';
  if (step.index === null) return step.name;
  return `step ${step.index} "${step.name}" (${step.kind}${step.inputType ? `: ${step.inputType}` : ''})`;
}

// evaluate.js writes two kinds of stall: a rAF gap with no cpu behind it, and a task long on the
// wall clock with its cpu under budget. a task stall had cpu behind it, so one "no cpu" count for
// both lied about every task in it. counted apart, and the grammar survives a count of 1 (¬‿¬)
function stallsText(stalls) {
  const gaps = stalls.filter((s) => s.what.includes('rAF gap')).length;
  const tasks = stalls.length - gaps;
  const parts = [];
  if (gaps > 0) parts.push(`${plural(gaps, 'rAF gap')} with no cpu behind ${gaps === 1 ? 'it' : 'them'}`);
  if (tasks > 0) parts.push(`${plural(tasks, 'task')} long on the wall clock only`);
  return parts.join(', ');
}

function lines(v) {
  const d = v.data ?? {};
  switch (v.check) {
    case 'frame': {
      const out = [`  ${label('frame')} ${plural(d.count, 'frame')} over ${f1(v.limit)}ms. worst ${f1(d.worst)}ms main-thread cpu at +${f1(d.at)}ms (${runValues(v)})`];
      if (d.heavy.length > 0) {
        const forced = d.heavy.find((h) => h.forcedFrom)?.forcedFrom;
        out.push(`${CONT}inside: ${d.heavy.map((h) => `${h.name} ${f1(h.ms)}ms x${h.count}`).join(', ')}${forced ? `, forced from ${forced}` : ''}`);
      }
      return out;
    }
    case 'input': {
      const out = [`  ${label('input')} ${d.name} painted after ${f1(d.duration)}ms (limit ${f1(v.limit)}, rounded to 8ms). input delay ${f1(d.inputDelay)}, processing ${f1(d.processing)}, presentation ${f1(d.presentation)}`];
      if (d.scripts.length > 0) out.push(`${CONT}scripts: ${scriptsText(d.scripts)}`);
      return out;
    }
    case 'task': {
      const out = [`  ${label('task')} ${plural(d.over.length, 'task')} over ${f1(v.limit)}ms of main-thread cpu. worst ${f1(d.worst)}ms (${runValues(v)})`];
      if (d.scripts.length > 0) out.push(`${CONT}scripts: ${scriptsText(d.scripts)}`);
      return out;
    }
    case 'answer':
      return [`  ${label('answer')} first answer ${f1(d.latency)}ms after the input (${d.what}, limit ${f1(v.limit)})`];
    case 'silent':
      return [`  ${label('silent')} nothing answered the input. if intended, { answer: false, why }`];
    case 'settle':
      return [`  ${label('settle')} never settled within ${f1(d.timeout)}ms. something kept animating or mutating`];
    case 'shift':
      return [
        `  ${label('shift')} ${d.value < 0.0001 ? d.value.toExponential(1) : d.value.toFixed(4)} with no recent input. ${d.sources.map((s) => `${s.path} moved ${f1(s.dx)},${f1(s.dy)}`).join('; ')}`,
        `${CONT}if intended, feel.allowShift(selector, why)`,
      ];
    case 'property':
      return [`  ${label('property')} ${d.name} animates ${d.properties.join(', ')} on ${d.target}${d.pseudo ?? ''}. only transform and opacity may animate`];
    case 'composite':
      return [`  ${label('composite')} ${d.displayName || 'an animation'} on ${d.nodeName} ran on the main thread: ${d.reasons.join(', ')}${d.unsupportedProperties.length > 0 ? ` (${d.unsupportedProperties.join(', ')})` : ''}`];
    case 'family':
      return [`  ${label('family')} ${d.rule}: ${d.name} on ${d.target}${d.pseudo ?? ''}${d.easings.length > 0 ? ` (${d.easings.join(', ')})` : ''}`];
    case 'drops':
      return [`  ${label('drops')} ${plural(d.count, 'compositor frame')} dropped while this step ran`];
    case 'exemption':
      return [`  ${label('exemption')} ${d.kind} exemption on ${d.target} was declared and no run used it (${d.why})`];
    default:
      return [`  ${label(v.check)} ${JSON.stringify(d)}`];
  }
}

export function formatReport(r) {
  const out = [];
  const groups = new Map();
  for (const v of r.violations) {
    const key = v.step === null ? 'scenario' : v.step.index === null ? v.step.name : `#${v.step.index}`;
    if (groups.has(key) === false) groups.set(key, []);
    groups.get(key).push(v);
  }
  out.push(r.result === 'pass'
    ? `feel: ${r.scenario} / ${r.matrix} passed. ${runsLine(r)}`
    : `feel: ${r.scenario} / ${r.matrix} failed ${plural(r.violations.length, 'check')} in ${plural(groups.size, 'step')}. ${runsLine(r)}`);
  out.push(envLine(r.env));
  for (const vs of groups.values()) {
    out.push('', stepTitle(vs[0].step));
    for (const v of vs) out.push(...lines(v));
  }
  out.push('');
  out.push(r.unconfirmed.length === 0
    ? 'unconfirmed: none'
    : `unconfirmed: ${r.unconfirmed.map((u) => `step ${u.step.index} ${u.check} ${f1(Math.max(...u.values.map((x) => x.value)))}ms in run ${u.values.filter((x) => x.value > u.limit).map((x) => x.run).join(' and ')} only`).join('; ')}. annotated feel-unconfirmed`);
  out.push(r.stalls.length === 0 ? 'stalls: none' : `stalls: ${stallsText(r.stalls)} (runner descheduled chromium). informational`);
  out.push(r.exemptions.length === 0
    ? 'exemptions: none'
    : `exemptions: ${r.exemptions.map((e) => `${e.kind} ${e.target} (${e.why})${e.used ? '' : ', unused'}`).join('; ')}`);
  const total = r.runs[0]?.steps.length ?? 0;
  const failedSteps = [...groups.keys()].filter((k) => k.startsWith('#')).length;
  const animations = r.runs[0]?.seen.animations ?? 0;
  const property = r.violations.some((v) => v.check === 'property');
  const composite = r.violations.some((v) => v.check === 'composite');
  out.push(`passed: ${plural(total - failedSteps, r.violations.length > 0 ? 'other step' : 'step')}. ${plural(animations, 'animation')}, ${property ? 'not all' : 'all'} transform or opacity, ${composite ? 'not all' : 'all'} composited`);
  return `${out.join('\n')}\n`;
}
