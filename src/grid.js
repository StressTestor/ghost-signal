// grid parsing and the grid-to-svg-symbol step, with no imports of its own. gs.js re-exports all
// of it; scripts/gen.js reads grids through here so it can regenerate src/icons.js even when
// that file is missing (gs.js imports it, so going through gs.js would need it to exist first)

export class GsGridError extends Error {
  constructor(message) { super(message); this.name = 'GsGridError'; }
}

export function parseGrid(textOrRows, cols, rows) {
  const raw = Array.isArray(textOrRows) ? textOrRows : String(textOrRows).split(/[\n/]/);
  const lines = raw.map((r) => String(r).trim()).filter((r) => r.length > 0);
  const width = cols ?? (lines[0]?.length ?? 0);
  const height = rows ?? lines.length;
  if (lines.length !== height) throw new GsGridError(`expected ${height} rows, got ${lines.length}`);
  lines.forEach((line, i) => {
    if (line.length !== width) throw new GsGridError(`row ${i} has ${line.length} cells, expected ${width}`);
    if (/^[.#]+$/.test(line) === false) throw new GsGridError(`row ${i} has a character other than . or #`);
  });
  return lines;
}

// a grid as an svg symbol: one unit rect per lit cell. fill is inherited so currentColor works
export function gridToSymbol(name, grid) {
  const rects = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    });
  });
  return `<symbol id="gs-${name}" viewBox="0 0 ${grid[0].length} ${grid.length}" shape-rendering="crispEdges">${rects.join('')}</symbol>`;
}
