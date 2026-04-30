// Print + PDF helpers for the receipt.
import { jsPDF } from "jspdf";
import type { PaperWidth } from "@/lib/settings";

/** Trigger the browser print dialog; @media print rules show only .receipt-print. */
export function printReceipt(): void {
  window.print();
}

/** Generate a PDF of the receipt text sized to selected paper width. */
export function downloadReceiptPdf(
  text: string,
  filename: string,
  paperWidth: PaperWidth = "80mm",
): void {
  const lines = text.split("\n");
  const widthMm = paperWidth === "58mm" ? 58 : 80;
  const lineHeight = paperWidth === "58mm" ? 3.2 : 3.6;
  const fontSize = paperWidth === "58mm" ? 8 : 9;
  const topPad = 4;
  const bottomPad = 6;
  const pageHeight = Math.max(60, topPad + bottomPad + lines.length * lineHeight);

  const doc = new jsPDF({
    unit: "mm",
    format: [widthMm, pageHeight],
    orientation: "portrait",
  });
  doc.setFont("courier", "normal");
  doc.setFontSize(fontSize);
  let y = topPad;
  for (const ln of lines) {
    doc.text(ln, 3, y, { baseline: "top" });
    y += lineHeight;
  }
  doc.save(filename);
}
