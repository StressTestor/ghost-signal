// the three ways a feel run ends badly. unevaluable means the harness could not measure, which is
// never the same thing as a pass (spec 7.8). a config error means a spec tried to loosen a budget
// or skip a why. a feel error carries the report, so a control test can read which check fired
export class GsFeelConfigError extends Error {
  constructor(message) { super(message); this.name = 'GsFeelConfigError'; }
}
export class GsFeelUnevaluable extends Error {
  constructor(message) { super(message); this.name = 'GsFeelUnevaluable'; }
}
export class GsFeelError extends Error {
  constructor(message, report) { super(message); this.name = 'GsFeelError'; this.report = report; }
}
