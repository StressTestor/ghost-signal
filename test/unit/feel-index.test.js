import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as feel from '../../src/feel/index.js';
import * as errors from '../../src/feel/errors.js';

// a clash between two star exports silently removes the name, so every public pure name is looked
// up here. nothing else in the suite imports index.js
test('index.js re-exports every pure name, unambiguous', () => {
  for (const name of [
    'GsFeelConfigError', 'GsFeelUnevaluable', 'GsFeelError',
    'parseDuration', 'loadBudgets', 'mergeBudgets', 'isVsyncMiss', 'worstInteraction', 'isUnpromptedShift', 'animatedProperties', 'familyOf', 'isStepped', 'isEased', 'BOOKKEEPING_KEYS',
    'TRACE_CATEGORIES', 'COMPOSITE_IGNORED', 'rendererPid', 'compositeResults', 'decodeComposite', 'summarizeTrace', 'frameCosts',
    'REPORT_VERSION', 'TIMING_CHECKS', 'DROPS_GATE', 'evaluateRun', 'needsThirdRun', 'combineRuns',
    'formatReport',
  ]) assert.ok(name in feel, `${name} is missing from src/feel/index.js`);
  assert.equal(feel.GsFeelUnevaluable, errors.GsFeelUnevaluable);
});

test('index.js pulls in no page code and no playwright fixture', () => {
  assert.equal('installProbe' in feel, false);
  assert.equal('withFeel' in feel, false);
});
