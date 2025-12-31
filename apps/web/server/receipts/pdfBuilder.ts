const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

type FontKey = "F1" | "F2" | "F3";

export type PdfTextOptions = {
  x?: number;
  font?: FontKey;
  size?: number;
  lineHeight?: number;
  maxWidth?: number;
};

export class PdfBuilder {
  private readonly operations: string[] = [];
  private y = PAGE_HEIGHT - MARGIN;

  addText(text: string, options: PdfTextOptions = {}) {
    const font: FontKey = options.font ?? "F1";
    const size = options.size ?? 11;
    const lineHeight = options.lineHeight ?? size + 4;
    const maxWidth = options.maxWidth ?? PAGE_WIDTH - MARGIN * 2;
    const charsPerLine = Math.max(Math.floor(maxWidth / (size * 0.55)), 8);
    const lines = wrapText(text, charsPerLine);
    for (const line of lines) {
      const x = options.x ?? MARGIN;
      this.operations.push(
        [
          "BT",
          `/${font} ${size.toFixed(2)} Tf`,
          `1 0 0 1 ${x.toFixed(2)} ${this.y.toFixed(2)} Tm`,
          `(${escapePdfText(line)}) Tj`,
          "ET",
        ].join("\n")
      );
      this.y -= lineHeight;
    }
  }

  addKeyValue(label: string, value: string) {
    this.addText(`${label}: ${value}`, { font: "F2", size: 10, lineHeight: 14 });
  }

  addSpacing(amount = 10) {
    this.y -= amount;
  }

  drawRule() {
    this.operations.push(
      `q 0.5 w ${MARGIN} ${this.y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${this.y.toFixed(
        2
      )} l S Q`
    );
    this.y -= 8;
  }

  addTable(headers: string[], rows: string[][], columnWidths: number[]) {
    const startY = this.y;
    const rowHeight = 16;
    let cursorY = startY;
    const safeColumnWidths = normalizeColumnWidths(columnWidths, PAGE_WIDTH - MARGIN * 2);
    const headerLine = formatRow(headers, safeColumnWidths);
    this.operations.push(textOperation(headerLine, MARGIN, cursorY, "F3", 10));
    cursorY -= rowHeight;

    for (const row of rows) {
      const formattedRow = formatRow(row, safeColumnWidths);
      this.operations.push(textOperation(formattedRow, MARGIN, cursorY, "F3", 10));
      cursorY -= rowHeight;
    }

    this.y = cursorY - 4;
    this.operations.push(
      `q 0.5 w ${MARGIN} ${startY + 2} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${startY + 2} l S Q`
    );
    this.operations.push(
      `q 0.5 w ${MARGIN} ${cursorY + rowHeight - 6} m ${(PAGE_WIDTH - MARGIN).toFixed(
        2
      )} ${cursorY + rowHeight - 6} l S Q`
    );
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
    objects.push("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
    objects.push("6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj");
    objects.push("7 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj");

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
    const xrefEntries = offsets
      .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `)
      .join("\n");
    const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefEntries}\n`;
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`;

    const pdf = `%PDF-1.4\n${body}${xref}${trailer}`;
    return Buffer.from(pdf, "binary");
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length > maxChars) {
      if (current.length > 0) lines.push(current);
      if (word.length > maxChars) {
        lines.push(word.slice(0, maxChars));
        current = word.slice(maxChars);
      } else {
        current = word;
      }
    } else {
      current = next;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length ? lines : [""];
}

function escapePdfText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function normalizeColumnWidths(widths: number[], available: number) {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total === 0) return widths.map(() => available / widths.length);
  const scale = available / total;
  return widths.map((w) => w * scale);
}

function formatRow(columns: string[], widths: number[]) {
  const padded = columns.map((col, index) => {
    const width = widths[index] ?? widths[widths.length - 1];
    const maxChars = Math.max(Math.floor(width / 6), 4);
    const value = col.length > maxChars ? `${col.slice(0, maxChars - 1)}…` : col;
    return value.padEnd(maxChars, " ");
  });
  return padded.join(" ");
}

function textOperation(text: string, x: number, y: number, font: FontKey, size: number) {
  return ["BT", `/${font} ${size.toFixed(2)} Tf`, `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`, `(${escapePdfText(text)}) Tj`, "ET"].join(
    "\n"
  );
}
