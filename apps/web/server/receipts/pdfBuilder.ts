const PAGE_WIDTH = 595.28; // A4 points
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

type FontKey = "F1" | "F2" | "F3"; // Helvetica, Helvetica-Bold, Courier (optional)

export type PdfTextOptions = {
  x?: number;
  font?: FontKey;
  size?: number;
  lineHeight?: number;
  maxWidth?: number;
};

type TableColumn = {
  width: number; // relative weight (same as your old columnWidths)
  align?: "left" | "right" | "center";
};

export class PdfBuilder {
  private readonly operations: string[] = [];
  private y = PAGE_HEIGHT - MARGIN;

  // ---- Public API ----

  addText(text: string, options: PdfTextOptions = {}) {
    const font: FontKey = options.font ?? "F1";
    const size = options.size ?? 11;
    const lineHeight = options.lineHeight ?? size + 4;
    const x = options.x ?? MARGIN;

    const maxWidth = options.maxWidth ?? PAGE_WIDTH - MARGIN * 2;
    const lines = this.wrapToWidth(text, maxWidth, size);

    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.operations.push(this.textOp(line, x, this.y, font, size));
      this.y -= lineHeight;
    }
  }

  addKeyValue(label: string, value: string, opts?: { size?: number }) {
    const size = opts?.size ?? 10;
    this.addText(`${label}: ${value}`, { font: "F2", size, lineHeight: size + 5 });
  }

  addSpacing(amount = 10) {
    this.y -= amount;
  }

  drawRule(opts?: { thickness?: number; inset?: number; gapAfter?: number }) {
    const thickness = opts?.thickness ?? 0.6;
    const inset = opts?.inset ?? 0;
    const gapAfter = opts?.gapAfter ?? 10;

    const x1 = MARGIN + inset;
    const x2 = PAGE_WIDTH - MARGIN - inset;

    // draw at current y, then move down a bit
    this.operations.push(this.lineOp(x1, this.y, x2, this.y, thickness));
    this.y -= gapAfter;
  }

  /**
   * Clean, simple table:
   * - Helvetica by default
   * - Header bold
   * - Horizontal rules only (top, header-sep, bottom)
   * - Right-align numeric columns
   */
  addTable(
    headers: string[],
    rows: string[][],
    columns: (number | TableColumn)[],
    opts?: {
      fontSize?: number;
      rowHeight?: number;
      headerFont?: FontKey;
      bodyFont?: FontKey;
      ruleThickness?: number;
      topGap?: number;
      bottomGap?: number;
    }
  ) {
    const fontSize = opts?.fontSize ?? 10;
    const rowHeight = opts?.rowHeight ?? 16;
    const headerFont: FontKey = opts?.headerFont ?? "F2";
    const bodyFont: FontKey = opts?.bodyFont ?? "F1";
    const ruleThickness = opts?.ruleThickness ?? 0.6;
    const topGap = opts?.topGap ?? 6;
    const bottomGap = opts?.bottomGap ?? 10;

    const cols = normalizeColumns(columns, PAGE_WIDTH - MARGIN * 2);

    // small gap so table doesn't "underline" previous heading
    this.addSpacing(topGap);

    const tableTopY = this.y;
    const headerBaselineY = tableTopY - 12; // baseline for header text inside table

    // Ensure space for header + at least one row + bottom rule
    const minHeight = 12 + rowHeight + 10 + bottomGap;
    this.ensureSpace(minHeight);

    // Top rule (tight to table, not to previous heading)
    this.operations.push(this.lineOp(MARGIN, tableTopY, PAGE_WIDTH - MARGIN, tableTopY, ruleThickness));

    // Header row
    this.drawTableRow(headers, cols, headerBaselineY, headerFont, fontSize);

    // Header separator (below header text)
    const headerSepY = headerBaselineY - 8;
    this.operations.push(this.lineOp(MARGIN, headerSepY, PAGE_WIDTH - MARGIN, headerSepY, ruleThickness));

    // Body rows
    let cursorBaselineY = headerBaselineY - rowHeight;
    for (const row of rows) {
      this.drawTableRow(row, cols, cursorBaselineY, bodyFont, fontSize);
      cursorBaselineY -= rowHeight;
    }

    // Bottom rule (below last row text)
    const lastRowBaselineY = cursorBaselineY + rowHeight;
    const bottomRuleY = lastRowBaselineY - 8;
    this.operations.push(this.lineOp(MARGIN, bottomRuleY, PAGE_WIDTH - MARGIN, bottomRuleY, ruleThickness));

    // Move cursor below table
    this.y = bottomRuleY - bottomGap;
  }

  build(): Buffer {
    const content = this.operations.join("\n") + "\n";

    const objects: string[] = [];
    objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
    objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
    objects.push(
      `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(
        2
      )}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >> endobj`
    );

    objects.push(`4 0 obj << /Length ${content.length} >> stream\n${content}endstream endobj`);

    // Built-in Type1 fonts
    objects.push("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
    objects.push("6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj");
    objects.push("7 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj");

    // xref
    let position = "%PDF-1.4\n".length;
    const offsets = [0];
    const body = objects
      .map((obj) => {
        const offset = position;
        offsets.push(offset);
        position += obj.length + 1;
        return `${obj}\n`;
      })
      .join("");

    const xrefPosition = "%PDF-1.4\n".length + body.length;
    const xrefEntries = offsets.map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `).join("\n");
    const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefEntries}\n`;
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`;

    return Buffer.from(`%PDF-1.4\n${body}${xref}${trailer}`, "binary");
  }

  // ---- Internals ----

  private ensureSpace(requiredHeight: number) {
    // single-page builder for now; if you want multi-page later we can add it.
    const bottom = MARGIN;
    if (this.y - requiredHeight < bottom) {
      // Hard reset to avoid writing off-page. (Better: implement page breaks.)
      this.y = bottom + requiredHeight;
    }
  }

  private sanitizeText(text: string) {
    // Your minimal PDF string approach + built-in fonts = safest with ASCII.
    // Convert common “problem glyphs” to ASCII equivalents.
    return text
      .replace(/\u2022/g, "*") // bullet
      .replace(/\u2192/g, "->") // arrow
      .replace(/\u2013|\u2014/g, "-") // en/em dash
      .replace(/\u00A0/g, " ") // nbsp
      .replace(/[^\x20-\x7E]/g, ""); // strip other non-ascii
  }

  private escapePdfText(text: string) {
    const t = this.sanitizeText(text);
    return t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  private textOp(text: string, x: number, y: number, font: FontKey, size: number) {
    return [
      "BT",
      `/${font} ${size.toFixed(2)} Tf`,
      `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
      `(${this.escapePdfText(text)}) Tj`,
      "ET",
    ].join("\n");
  }

  private lineOp(x1: number, y1: number, x2: number, y2: number, thickness: number) {
    return `q ${thickness.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(
      2
    )} ${y2.toFixed(2)} l S Q`;
  }

  private approxTextWidth(text: string, fontSize: number) {
    // Rough average width for Helvetica
    return text.length * fontSize * 0.52;
  }

  private wrapToWidth(text: string, maxWidth: number, fontSize: number): string[] {
    const clean = this.sanitizeText(text);
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (this.approxTextWidth(next, fontSize) > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  private drawTableRow(
    cells: string[],
    cols: { width: number; align: "left" | "right" | "center" }[],
    baselineY: number,
    font: FontKey,
    size: number,
  ) {
    const x0 = MARGIN;
    const paddingX = 6;

    let x = x0;

    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]!;
      const cell = this.sanitizeText(cells[i] ?? "");
      const cellMaxWidth = col.width - paddingX * 2;

      // clamp with ellipsis if too wide
      const clipped = this.clipToWidth(cell, cellMaxWidth, size);

      let textX = x + paddingX;

      if (col.align === "right") {
        const w = this.approxTextWidth(clipped, size);
        textX = x + col.width - paddingX - w;
      } else if (col.align === "center") {
        const w = this.approxTextWidth(clipped, size);
        textX = x + (col.width - w) / 2;
      }

      this.operations.push(this.textOp(clipped, textX, baselineY, font, size));
      x += col.width;
    }
  }

  private clipToWidth(text: string, maxWidth: number, fontSize: number) {
    if (this.approxTextWidth(text, fontSize) <= maxWidth) return text;
    const ell = "...";
    let out = text;
    while (out.length > 0 && this.approxTextWidth(out + ell, fontSize) > maxWidth) {
      out = out.slice(0, -1);
    }
    return out.length ? out + ell : ell;
  }
}

function normalizeColumns(columns: (number | TableColumn)[], available: number) {
  const cols = columns.map((c) =>
    typeof c === "number" ? ({ width: c, align: "left" as const }) : ({ align: "left" as const, ...c })
  );

  const total = cols.reduce((sum, c) => sum + (c.width || 0), 0);
  const scale = total > 0 ? available / total : available / cols.length;

  return cols.map((c) => ({
    width: (c.width || 1) * scale,
    align: c.align ?? "left",
  }));
}
