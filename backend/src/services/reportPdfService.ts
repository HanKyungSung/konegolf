import PDFDocument from 'pdfkit';
import { MonthlyReportData } from '../repositories/monthlyReportRepo';

const MARGIN = 50;
const PAGE_WIDTH = 612; // Letter size
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function formatMonth(month: number, year: number): string {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { month: '2-digit', day: '2-digit', year: '2-digit' });
}

function formatPaymentMethod(method: string): string {
  switch (method) {
    case 'CARD': return 'Card';
    case 'CASH': return 'Cash';
    case 'GIFT_CARD': return 'Gift Card';
    default: return method;
  }
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: { text: string; x: number; width: number; align?: 'left' | 'right' | 'center' }[],
  options?: { bold?: boolean; fontSize?: number }
): number {
  const fontSize = options?.fontSize || 9;
  doc.fontSize(fontSize);
  if (options?.bold) doc.font('Helvetica-Bold');
  else doc.font('Helvetica');

  for (const col of cols) {
    doc.text(col.text, col.x, y, { width: col.width, align: col.align || 'left' });
  }
  return y + fontSize + 6;
}

function drawSectionHeader(doc: PDFKit.PDFDocument, y: number, title: string): number {
  if (y > 700) {
    doc.addPage();
    y = MARGIN;
  }
  doc.font('Helvetica-Bold').fontSize(11).text(title, MARGIN, y);
  y += 16;
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.5).stroke('#333333');
  return y + 8;
}

function drawHr(doc: PDFKit.PDFDocument, y: number): number {
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.3).stroke('#999999');
  return y + 6;
}

export function generateMonthlyReportPdf(data: MonthlyReportData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });

  // ── Header ──
  doc.font('Helvetica-Bold').fontSize(18).text('K-Golf', MARGIN, MARGIN, { align: 'center' });
  doc.fontSize(13).text('MONTHLY SALES REPORT', MARGIN, MARGIN + 24, { align: 'center' });
  doc.font('Helvetica').fontSize(9);
  doc.text(
    `Period: ${formatDate(data.period.startDate)} – ${formatDate(new Date(data.period.endDate.getTime() - 86400000))}`,
    MARGIN,
    MARGIN + 44,
    { align: 'center' }
  );
  doc.text(
    `Generated: ${new Date().toLocaleDateString('en-CA')} ${new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}`,
    MARGIN,
    MARGIN + 56,
    { align: 'center' }
  );

  let y = MARGIN + 80;

  // ── Payment Types ──
  y = drawSectionHeader(doc, y, 'Payment Types');
  const ptCols = [
    { x: MARGIN, width: 200 },
    { x: MARGIN + 200, width: 100, align: 'right' as const },
    { x: MARGIN + 320, width: 150, align: 'right' as const },
  ];
  y = drawTableRow(doc, y, [
    { ...ptCols[0], text: 'Description' },
    { ...ptCols[1], text: 'Count' },
    { ...ptCols[2], text: 'Amount' },
  ], { bold: true });
  y = drawHr(doc, y);

  for (const pt of data.paymentTypes) {
    y = drawTableRow(doc, y, [
      { ...ptCols[0], text: formatPaymentMethod(pt.method) },
      { ...ptCols[1], text: pt.count.toString() },
      { ...ptCols[2], text: formatCurrency(pt.amount) },
    ]);
  }

  const totalPayments = data.paymentTypes.reduce((s, p) => s + p.amount, 0);
  const totalPaymentCount = data.paymentTypes.reduce((s, p) => s + p.count, 0);
  y = drawHr(doc, y);
  y = drawTableRow(doc, y, [
    { ...ptCols[0], text: 'Total' },
    { ...ptCols[1], text: totalPaymentCount.toString() },
    { ...ptCols[2], text: formatCurrency(totalPayments) },
  ], { bold: true });
  y += 12;

  // ── Sales Breakdown ──
  y = drawSectionHeader(doc, y, 'Sales Breakdown');
  const sbCols = [
    { x: MARGIN, width: 200 },
    { x: MARGIN + 200, width: 100, align: 'right' as const },
    { x: MARGIN + 320, width: 150, align: 'right' as const },
  ];
  y = drawTableRow(doc, y, [
    { ...sbCols[0], text: 'Category' },
    { ...sbCols[1], text: 'Items' },
    { ...sbCols[2], text: 'Amount' },
  ], { bold: true });
  y = drawHr(doc, y);

  y = drawTableRow(doc, y, [
    { ...sbCols[0], text: 'Room Bookings' },
    { ...sbCols[1], text: data.operationalStats.totalBookings.toString() },
    { ...sbCols[2], text: formatCurrency(data.salesBreakdown.roomRevenue) },
  ]);

  for (const ms of data.salesBreakdown.menuSales) {
    y = drawTableRow(doc, y, [
      { ...sbCols[0], text: ms.category },
      { ...sbCols[1], text: ms.count.toString() },
      { ...sbCols[2], text: formatCurrency(ms.amount) },
    ]);
  }

  y = drawHr(doc, y);
  y = drawTableRow(doc, y, [
    { ...sbCols[0], text: 'Gross Sales' },
    { ...sbCols[1], text: '' },
    { ...sbCols[2], text: formatCurrency(data.salesBreakdown.grossSales) },
  ], { bold: true });
  y = drawTableRow(doc, y, [
    { ...sbCols[0], text: 'Discounts' },
    { ...sbCols[1], text: '' },
    { ...sbCols[2], text: `-${formatCurrency(data.salesBreakdown.totalDiscounts)}` },
  ]);
  y = drawTableRow(doc, y, [
    { ...sbCols[0], text: 'Net Sales' },
    { ...sbCols[1], text: '' },
    { ...sbCols[2], text: formatCurrency(data.salesBreakdown.netSales) },
  ], { bold: true });
  y += 12;

  // ── Tax Summary ──
  y = drawSectionHeader(doc, y, 'Tax Summary');
  y = drawTableRow(doc, y, [
    { x: MARGIN, width: 300, text: `Tax Rate (${(data.taxSummary.taxRate * 100).toFixed(0)}%)` },
    { x: MARGIN + 320, width: 150, align: 'right', text: formatCurrency(data.taxSummary.totalTax) },
  ]);
  y += 12;

  // ── Tips Summary ──
  y = drawSectionHeader(doc, y, 'Tips Summary');
  y = drawTableRow(doc, y, [
    { x: MARGIN, width: 300, text: 'Total Tips' },
    { x: MARGIN + 320, width: 150, align: 'right', text: formatCurrency(data.tipsSummary.totalTips) },
  ]);
  y += 12;

  // ── Discount Detail ──
  if (data.discountDetail.length > 0) {
    y = drawSectionHeader(doc, y, 'Discount Detail');
    y = drawTableRow(doc, y, [
      { x: MARGIN, width: 200, text: 'Type' },
      { x: MARGIN + 200, width: 100, align: 'right', text: 'Count' },
      { x: MARGIN + 320, width: 150, align: 'right', text: 'Amount' },
    ], { bold: true });
    y = drawHr(doc, y);
    for (const d of data.discountDetail) {
      y = drawTableRow(doc, y, [
        { x: MARGIN, width: 200, text: d.type },
        { x: MARGIN + 200, width: 100, align: 'right', text: d.count.toString() },
        { x: MARGIN + 320, width: 150, align: 'right', text: formatCurrency(d.amount) },
      ]);
    }
  }

  // ── Report Totals ──
  y += 8;
  y = drawSectionHeader(doc, y, 'Report Totals');
  const reportTotals = [
    ['Net Sales', formatCurrency(data.salesBreakdown.netSales)],
    ['Tax Collected', formatCurrency(data.taxSummary.totalTax)],
    ['Tips', formatCurrency(data.tipsSummary.totalTips)],
  ];
  for (const [label, value] of reportTotals) {
    y = drawTableRow(doc, y, [
      { x: MARGIN, width: 300, text: label },
      { x: MARGIN + 320, width: 150, align: 'right', text: value },
    ]);
  }
  // Grand total
  y = drawHr(doc, y);
  y = drawTableRow(doc, y, [
    { x: MARGIN, width: 300, text: 'Grand Total (incl. Tips)' },
    {
      x: MARGIN + 320,
      width: 150,
      align: 'right',
      text: formatCurrency(
        data.salesBreakdown.netSales + data.taxSummary.totalTax + data.tipsSummary.totalTips
      ),
    },
  ], { bold: true, fontSize: 11 });

  // ── Footer ──
  doc.fontSize(7).font('Helvetica').fillColor('#999999');
  doc.text(
    `K-Golf Monthly Sales Report — ${formatMonth(data.period.month, data.period.year)}`,
    MARGIN,
    750,
    { align: 'center' }
  );

  doc.end();
  return doc;
}
