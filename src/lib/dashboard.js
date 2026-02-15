/**
 * Dashboard — Fixed-header terminal UI with ANSI scroll regions
 *
 * Zero dependencies. Uses DECSTBM scroll regions to pin a header
 * at the top while logs scroll naturally below.
 *
 * Ported from the battle-tested comms/v2 orchestrator (120+ tasks).
 */

const SPINNER = ["\u28CB", "\u28D9", "\u28F9", "\u28F8", "\u28FC", "\u28F4", "\u28E6", "\u28E7", "\u28C7", "\u28CF"];

class Dashboard {
  constructor() {
    this.cols = process.stdout.columns || 120;
    this.rows = process.stdout.rows || 30;
    this.headerHeight = 5;
    this.started = false;
    this.headerLines = [];
    this.spinnerFrame = 0;
    this._resizeHandler = null;
    this._tickTimer = null;
    this._headerBuilder = null;
  }

  get spinner() {
    this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER.length;
    return SPINNER[this.spinnerFrame];
  }

  start(headerBuilder, opts = {}) {
    if (!process.stdout.isTTY) return;
    this.started = true;
    this._headerBuilder = headerBuilder;
    this._updateSize();

    process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J");
    this._applyScrollRegion();
    process.stdout.write(`\x1b[${this.rows};1H`);

    this._resizeHandler = () => {
      this._updateSize();
      this._applyScrollRegion();
      this._paintHeader();
    };
    process.stdout.on("resize", this._resizeHandler);

    const tickMs = opts.tickMs || 200;
    this._tickTimer = setInterval(() => {
      if (this._headerBuilder) {
        this.setHeader(this._headerBuilder());
      }
    }, tickMs);
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    if (this._tickTimer) clearInterval(this._tickTimer);
    if (this._resizeHandler) {
      process.stdout.removeListener("resize", this._resizeHandler);
    }
    process.stdout.write("\x1b[r\x1b[?25h\x1b[?1049l\x1b[0m");
  }

  setHeader(lines) {
    if (!lines || !this.started) return;
    const newHeight = lines.length;
    const heightChanged = newHeight !== this.headerHeight;
    this.headerLines = lines;
    this.headerHeight = newHeight;
    if (heightChanged) this._applyScrollRegion();
    this._paintHeader();
  }

  log(formattedLine) {
    if (!this.started) {
      console.log(formattedLine);
      return;
    }
    process.stdout.write(`\x1b[${this.rows};1H\n\x1b[2K${formattedLine}`);
  }

  _updateSize() {
    this.cols = process.stdout.columns || 120;
    this.rows = process.stdout.rows || 30;
  }

  _applyScrollRegion() {
    if (!this.started) return;
    const top = this.headerHeight + 1;
    const bottom = this.rows;
    if (top < bottom) {
      process.stdout.write(`\x1b[${top};${bottom}r`);
    }
  }

  _paintHeader() {
    if (!this.started || this.headerLines.length === 0) return;
    process.stdout.write("\x1b[r");
    for (let i = 0; i < this.headerHeight; i++) {
      process.stdout.write(`\x1b[${i + 1};1H\x1b[2K`);
      if (this.headerLines[i]) {
        process.stdout.write(this.headerLines[i]);
      }
    }
    this._applyScrollRegion();
    process.stdout.write(`\x1b[${this.rows};1H`);
  }
}

module.exports = Dashboard;
