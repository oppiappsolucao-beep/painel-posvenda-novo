import PDFDocument from "pdfkit";

/** Converte uma imagem (buffer) em PDF de uma página para envio ao ZapSign. */
export function imageBufferToPdfBase64(buffer: Buffer, title: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    doc.on("error", reject);

    doc.fontSize(13).fillColor("#0f172a").text(title, { align: "center" });
    doc.moveDown(0.8);

    const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const maxHeight = doc.page.height - doc.page.margins.bottom - doc.y - 20;

    try {
      doc.image(buffer, doc.page.margins.left, doc.y, {
        fit: [maxWidth, maxHeight],
        align: "center",
        valign: "center",
      });
    } catch {
      doc.fontSize(11).fillColor("#64748b").text("Não foi possível exibir esta imagem.", { align: "center" });
    }

    doc.end();
  });
}
