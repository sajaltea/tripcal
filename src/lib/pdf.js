// Builds a payment-summary PDF for one "X pays Y" row.
// The PDF libraries are loaded only when needed, so the app stays fast.
import { toCents } from './money.js';

const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const ACCENT = [67, 56, 202];
const RED = [220, 38, 38];
const GREEN = [4, 120, 87];
const LINE = [229, 231, 235];

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function buildTransferPdf({ trip, expenses, payments, balances, plan, transfer, nameOf }) {
  const [{ jsPDF }, tableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = tableMod.autoTable || tableMod.default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  // The built-in PDF font has no ₹ sign, so amounts are written as "INR 275.00"
  const cur = trip.currency || 'INR';
  const money = (c) =>
    `${c < 0 ? '-' : ''}${cur} ${(Math.abs(c) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fromId = transfer.from;
  const toId = transfer.to;
  const fromName = nameOf(fromId);
  const toName = nameOf(toId);
  const bal = balances.find((b) => b.member.id === fromId);

  // ---------- Header band ----------
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, W, 86, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(trip.name, M, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const dates = trip.start_date ? `${fmtDate(trip.start_date)}${trip.end_date ? ` – ${fmtDate(trip.end_date)}` : ''}` : '';
  doc.text(['Payment summary', dates].filter(Boolean).join('   ·   '), M, 58);
  doc.text(`Created ${new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`, M, 72);

  // ---------- Amount to pay ----------
  let y = 118;
  doc.setDrawColor(...LINE);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(M, y - 22, W - 2 * M, 60, 8, 8, 'FD');
  doc.setTextColor(...MUTED);
  doc.setFontSize(10);
  doc.text('AMOUNT TO PAY', M + 16, y - 4);
  doc.setTextColor(...INK);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`${fromName} pays ${toName}`, M + 16, y + 16);
  doc.setTextColor(...RED);
  doc.setFontSize(22);
  doc.text(money(transfer.cents), W - M - 16, y + 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 58;

  // Other payments the same person has to make
  const others = plan.filter((p) => p.from === fromId && p.to !== toId);
  if (others.length) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(9.5);
    doc.text(`${fromName} also pays: ${others.map((p) => `${nameOf(p.to)} ${money(p.cents)}`).join(',  ')}`, M, y);
    y += 16;
  }

  const tableBase = {
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 6, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
    headStyles: { fillColor: [241, 243, 245], textColor: MUTED, fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [241, 243, 245], textColor: INK, fontStyle: 'bold' },
    theme: 'grid',
  };
  const sectionTitle = (text, at) => {
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(text, M, at);
    doc.setFont('helvetica', 'normal');
  };

  // ---------- How the balance is calculated ----------
  y += 14;
  sectionTitle(`How ${fromName}'s amount is calculated`, y);
  const calcRows = [
    ['Paid for the group', money(bal?.paid ?? 0)],
    ['Their share of all expenses', `- ${money(bal?.share ?? 0)}`],
  ];
  if (bal?.sent) calcRows.push(['Already paid back to others', `+ ${money(bal.sent)}`]);
  if (bal?.received) calcRows.push(['Already received from others', `- ${money(bal.received)}`]);
  const net = bal?.net ?? 0;
  autoTable(doc, {
    ...tableBase,
    startY: y + 8,
    body: calcRows,
    foot: [[net < 0 ? 'Needs to pay in total' : net > 0 ? 'Will receive in total' : 'Balance', money(Math.abs(net))]],
    columnStyles: { 1: { halign: 'right', cellWidth: 150 } },
    didParseCell: (d) => {
      if (d.section === 'foot' && d.column.index === 1) d.cell.styles.textColor = net < 0 ? RED : GREEN;
      if (d.section === 'foot' && d.column.index === 1) d.cell.styles.halign = 'right';
    },
  });
  y = doc.lastAutoTable.finalY + 26;

  // ---------- Expenses this person is part of ----------
  const mine = expenses
    .filter((e) => e.paid_by === fromId || e.expense_splits.some((s) => s.member_id === fromId))
    .slice()
    .sort((a, b) => a.spent_on.localeCompare(b.spent_on) || a.created_at.localeCompare(b.created_at));

  sectionTitle(`Expenses ${fromName} is part of (${mine.length})`, y);
  let shareSum = 0;
  let paidSum = 0;
  const expRows = mine.map((e) => {
    const share = toCents(e.expense_splits.find((s) => s.member_id === fromId)?.share ?? 0);
    const paid = e.paid_by === fromId ? toCents(e.amount) : 0;
    shareSum += share;
    paidSum += paid;
    return [fmtDate(e.spent_on), e.description, nameOf(e.paid_by), money(toCents(e.amount)), share ? money(share) : '—'];
  });
  autoTable(doc, {
    ...tableBase,
    startY: y + 8,
    head: [['Date', 'Expense', 'Paid by', 'Total', `${fromName}'s share`]],
    body: expRows.length ? expRows : [['', 'No expenses', '', '', '']],
    foot: [['', '', `Paid by ${fromName}: ${money(paidSum)}`, 'Share total', money(shareSum)]],
    columnStyles: { 0: { cellWidth: 72 }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index >= 3) d.cell.styles.halign = 'right';
      if (d.section === 'foot' && d.column.index >= 3) d.cell.styles.halign = 'right';
      if (d.section === 'foot' && d.column.index === 2) { d.cell.styles.fontStyle = 'normal'; d.cell.styles.textColor = MUTED; }
    },
  });
  y = doc.lastAutoTable.finalY + 26;

  // ---------- Payments already made / received ----------
  const pays = payments
    .filter((p) => p.from_member === fromId || p.to_member === fromId)
    .slice()
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  if (pays.length) {
    if (y > H - 120) { doc.addPage(); y = 50; }
    sectionTitle('Payments already made', y);
    autoTable(doc, {
      ...tableBase,
      startY: y + 8,
      head: [['Date', 'From', 'To', 'Note', 'Amount']],
      body: pays.map((p) => [fmtDate(p.paid_on), nameOf(p.from_member), nameOf(p.to_member), p.note || '', money(toCents(p.amount))]),
      columnStyles: { 0: { cellWidth: 72 }, 4: { halign: 'right' } },
      didParseCell: (d) => { if (d.section === 'head' && d.column.index === 4) d.cell.styles.halign = 'right'; },
    });
    y = doc.lastAutoTable.finalY + 26;
  }

  // ---------- Footer on every page ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.line(M, H - 34, W - M, H - 34);
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('Made with Trip Splitter', M, H - 20);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 20, { align: 'right' });
  }

  const safe = (s) => s.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
  const fileName = `${safe(trip.name)}_${safe(fromName)}_pays_${safe(toName)}.pdf`;
  return { blob: doc.output('blob'), fileName };
}

// Share the PDF (phone share sheet → WhatsApp etc.) or download it.
export async function sharePdf({ blob, fileName }, { title, text }) {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
