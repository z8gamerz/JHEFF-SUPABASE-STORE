import Papa from 'papaparse';
import { format } from 'date-fns';
import { Transaction, Customer, Expense, StoreInfo, CreditEntry } from '@/lib/db/idb';
import { DateRange } from './weekly-date';

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 or plain string
  contentType: string;
}

export interface ReportGenerationInput {
  dateRange: DateRange;
  store: StoreInfo | null;
  selectedBranchName: string;
  transactions: Transaction[];
  expenses: Expense[];
  customers: Customer[];
  creditEntries?: CreditEntry[];
  includeDailySummary: boolean;
  includeSalesJournal: boolean;
  includeCreditReport: boolean;
}

export interface ReportGenerationResult {
  subject: string;
  htmlBody: string;
  attachments: EmailAttachment[];
  summaryStats: {
    totalSales: number;
    totalProfit: number;
    totalExpenses: number;
    transactionCount: number;
    totalUtang: number;
    vatCollected: number;
    weeklyUtangCount: number;
    totalWeeklyCredit: number;
    fullyPaidCount: number;
    partialPaymentCount: number;
  };
}

export function generateReportEmailData(input: ReportGenerationInput): ReportGenerationResult {
  const {
    dateRange,
    store,
    selectedBranchName,
    transactions,
    expenses,
    customers,
    creditEntries = [],
    includeDailySummary,
    includeSalesJournal,
    includeCreditReport,
  } = input;

  // Filter transactions within dateRange
  const periodTransactions = transactions
    .filter(t => !t.isDeleted && t.timestamp >= dateRange.startDate.getTime() && t.timestamp <= dateRange.endDate.getTime())
    .sort((a, b) => a.timestamp - b.timestamp);

  // Filter expenses within dateRange
  const periodExpenses = expenses
    .filter(e => !e.isDeleted && e.timestamp >= dateRange.startDate.getTime() && e.timestamp <= dateRange.endDate.getTime());

  // Aggregate metrics
  const totalSales = periodTransactions.reduce((acc, t) => acc + (t.total || 0), 0);
  const totalCost = periodTransactions.reduce((acc, t) => {
    return acc + (t.items || []).reduce((sum, item) => sum + (item.costPrice || 0) * item.quantity, 0);
  }, 0);
  const totalExpenses = periodExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  const totalProfit = (totalSales - totalCost) - totalExpenses;
  const transactionCount = periodTransactions.length;
  const vatCollected = periodTransactions.reduce((acc, t) => acc + (t.vatAmount || 0), 0);
  const totalUtang = customers.reduce((acc, c) => acc + (c.totalUtang || 0), 0);

  const attachments: EmailAttachment[] = [];
  const storeName = store?.name || 'Sari-Sari Store';
  const rangeLabel = `${dateRange.startFormatted}_to_${dateRange.endFormatted}`;

  // 1. DAILY SUMMARY CSV
  let dailyBreakdownMap = new Map<string, {
    dateStr: string;
    dayName: string;
    sales: number;
    cost: number;
    expenses: number;
    transactions: number;
    vat: number;
  }>();

  // Initialize all days in Monday to Sunday cycle
  const currentCursor = new Date(dateRange.startDate);
  while (currentCursor <= dateRange.endDate) {
    const key = format(currentCursor, 'yyyy-MM-dd');
    dailyBreakdownMap.set(key, {
      dateStr: key,
      dayName: format(currentCursor, 'EEEE'),
      sales: 0,
      cost: 0,
      expenses: 0,
      transactions: 0,
      vat: 0,
    });
    currentCursor.setDate(currentCursor.getDate() + 1);
  }

  periodTransactions.forEach(t => {
    const key = format(t.timestamp, 'yyyy-MM-dd');
    const entry = dailyBreakdownMap.get(key);
    if (entry) {
      entry.sales += t.total;
      entry.transactions += 1;
      entry.vat += (t.vatAmount || 0);
      const tCost = (t.items || []).reduce((sum, item) => sum + (item.costPrice || 0) * item.quantity, 0);
      entry.cost += tCost;
    }
  });

  periodExpenses.forEach(e => {
    const key = format(e.timestamp, 'yyyy-MM-dd');
    const entry = dailyBreakdownMap.get(key);
    if (entry) {
      entry.expenses += e.amount;
    }
  });

  const dailyBreakdownList = Array.from(dailyBreakdownMap.values());

  if (includeDailySummary) {
    const dailyCsvRows = dailyBreakdownList.map(d => ({
      Date: d.dateStr,
      Day: d.dayName,
      'Total Sales (PHP)': d.sales.toFixed(2),
      'Total Expenses (PHP)': d.expenses.toFixed(2),
      'Estimated Profit (PHP)': (d.sales - d.cost - d.expenses).toFixed(2),
      'Transaction Count': d.transactions,
      'VAT Collected (PHP)': d.vat.toFixed(2),
    }));

    const dailyCsv = Papa.unparse(dailyCsvRows);
    attachments.push({
      filename: `Weekly_Daily_Summary_${rangeLabel}.csv`,
      content: dailyCsv,
      contentType: 'text/csv',
    });
  }

  // 2. SALES JOURNAL CSV
  if (includeSalesJournal) {
    const salesJournalRows = periodTransactions.map(t => ({
      'Date': format(t.timestamp, 'yyyy-MM-dd'),
      'Time': format(t.timestamp, 'hh:mm:ss a'),
      'OR Number': t.orNumber || 'N/A',
      'Branch': selectedBranchName,
      'Payment Method': (t.paymentMethod || 'Cash').toUpperCase(),
      'Items Count': (t.items || []).reduce((acc, i) => acc + i.quantity, 0),
      'Gross Total (PHP)': t.total.toFixed(2),
      'VAT Amount (PHP)': (t.vatAmount || 0).toFixed(2),
      'Net Sales (PHP)': (t.vatableSales || (t.total - (t.vatAmount || 0))).toFixed(2),
      'Status': 'COMPLETED',
    }));

    const journalCsv = Papa.unparse(salesJournalRows);
    attachments.push({
      filename: `Weekly_Sales_Journal_${rangeLabel}.csv`,
      content: journalCsv,
      contentType: 'text/csv',
    });
  }

  // 3. CREDIT & UTANG WEEKLY FLOW CALCULATION
  const periodCreditEntries = creditEntries.filter(
    e => !e.isDeleted && e.timestamp >= dateRange.startDate.getTime() && e.timestamp <= dateRange.endDate.getTime()
  );

  // Flow 1: Utang (New credits taken during this week)
  const weeklyUtangList = periodCreditEntries
    .filter(e => e.type === 'credit')
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(e => {
      const cust = customers.find(c => c.id === e.customerId);

      // Calculate customer's overall total utang balance (Kabuuang Total sa Utang)
      const totalCustCredits = creditEntries
        .filter(ce => !ce.isDeleted && ce.customerId === e.customerId && ce.type === 'credit' && ce.timestamp <= dateRange.endDate.getTime())
        .reduce((sum, ce) => sum + Math.abs(ce.amount), 0);

      const totalCustPayments = creditEntries
        .filter(ce => !ce.isDeleted && ce.customerId === e.customerId && ce.type === 'payment' && ce.timestamp <= dateRange.endDate.getTime())
        .reduce((sum, ce) => sum + Math.abs(ce.amount), 0);

      const calculatedBalance = Math.max(0, totalCustCredits - totalCustPayments);
      const kabuuangTotal = calculatedBalance > 0 ? calculatedBalance : (cust?.totalUtang || Math.abs(e.amount));

      return {
        name: cust?.name || 'Unknown Customer',
        dateCredit: format(e.timestamp, 'yyyy-MM-dd'),
        amount: Math.abs(e.amount),
        kabuuangTotal,
      };
    });

  const totalWeeklyCredit = weeklyUtangList.reduce((acc, item) => acc + item.amount, 0);

  // Flow 2 & 3: Payments (Fully Paid vs Partial Payment)
  const weeklyPayments = periodCreditEntries
    .filter(e => e.type === 'payment')
    .sort((a, b) => a.timestamp - b.timestamp);

  const fullyPaidList: Array<{
    name: string;
    dateOfPayment: string;
    amount: number;
  }> = [];

  const partialPaymentList: Array<{
    name: string;
    dateOfPayment: string;
    amount: number;
    remainingBalance: number;
  }> = [];

  weeklyPayments.forEach(p => {
    const cust = customers.find(c => c.id === p.customerId);
    const custName = cust?.name || 'Unknown Customer';
    const paymentAmount = Math.abs(p.amount);
    const dateStr = format(p.timestamp, 'yyyy-MM-dd');

    // Customer balance calculation at the end of the selected period
    const totalCustCredits = creditEntries
      .filter(e => !e.isDeleted && e.customerId === p.customerId && e.type === 'credit' && e.timestamp <= dateRange.endDate.getTime())
      .reduce((sum, e) => sum + Math.abs(e.amount), 0);

    const totalCustPayments = creditEntries
      .filter(e => !e.isDeleted && e.customerId === p.customerId && e.type === 'payment' && e.timestamp <= dateRange.endDate.getTime())
      .reduce((sum, e) => sum + Math.abs(e.amount), 0);

    const remainingBalance = Math.max(0, totalCustCredits - totalCustPayments);

    if (remainingBalance < 0.01) {
      fullyPaidList.push({
        name: custName,
        dateOfPayment: dateStr,
        amount: paymentAmount,
      });
    } else {
      partialPaymentList.push({
        name: custName,
        dateOfPayment: dateStr,
        amount: paymentAmount,
        remainingBalance,
      });
    }
  });

  // 3. CREDIT & UTANG CSV (Formatted matching Weekly Flow)
  if (includeCreditReport) {
    let creditCsvContent = `WEEKLY FLOW - CREDIT & UTANG (Mon - Sun)\n`;
    creditCsvContent += `Period: ${dateRange.startFormatted} to ${dateRange.endFormatted}\n`;
    creditCsvContent += `Branch: ${selectedBranchName}\n\n`;

    creditCsvContent += `=== UTANG ===\n`;
    creditCsvContent += `Name,Date Credit,Amount,Kabuuang Total sa Utang\n`;
    if (weeklyUtangList.length > 0) {
      weeklyUtangList.forEach(u => {
        creditCsvContent += `"${u.name.replace(/"/g, '""')}",${u.dateCredit},${u.amount.toFixed(2)},${u.kabuuangTotal.toFixed(2)}\n`;
      });
    } else {
      creditCsvContent += `No new credits recorded this week,,0.00,0.00\n`;
    }
    creditCsvContent += `Total Credit Amount,,${totalWeeklyCredit.toFixed(2)},\n\n`;

    creditCsvContent += `=== FULLY PAID ===\n`;
    creditCsvContent += `Name,Date of Payment,Amount\n`;
    if (fullyPaidList.length > 0) {
      fullyPaidList.forEach(f => {
        creditCsvContent += `"${f.name.replace(/"/g, '""')}",${f.dateOfPayment},${f.amount.toFixed(2)}\n`;
      });
    } else {
      creditCsvContent += `No fully settled accounts this week,,0.00\n`;
    }
    creditCsvContent += `\n`;

    creditCsvContent += `=== PARTIAL PAYMENT ===\n`;
    creditCsvContent += `Name,Date of Payment,Amount,Remaining Balance\n`;
    if (partialPaymentList.length > 0) {
      partialPaymentList.forEach(p => {
        creditCsvContent += `"${p.name.replace(/"/g, '""')}",${p.dateOfPayment},${p.amount.toFixed(2)},${p.remainingBalance.toFixed(2)}\n`;
      });
    } else {
      creditCsvContent += `No partial payments recorded this week,,,0.00\n`;
    }

    attachments.push({
      filename: `Weekly_Credit_Utang_Flow_${rangeLabel}.csv`,
      content: creditCsvContent,
      contentType: 'text/csv',
    });
  }

  // BUILD HTML EMAIL BODY
  const includedTitles = [
    includeDailySummary ? 'Daily Summary' : null,
    includeSalesJournal ? 'Sales Journal' : null,
    includeCreditReport ? 'Credit & Utang Weekly Flow' : null,
  ].filter(Boolean).join(', ');

  const subject = `[Weekly Report] ${storeName} – ${dateRange.label} (${selectedBranchName})`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
    .container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); color: #ffffff; padding: 32px 28px; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
    .title { font-size: 24px; font-weight: 900; margin: 12px 0 4px; letter-spacing: -0.5px; }
    .subtitle { font-size: 14px; opacity: 0.9; margin: 0; }
    .content { padding: 28px; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 24px; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; }
    .stat-label { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 4px; }
    .stat-value.highlight { color: #ea580c; }
    .stat-value.success { color: #16a34a; }
    .stat-value.danger { color: #dc2626; }
    .table-container { margin-top: 14px; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }
    th { background: #f1f5f9; padding: 10px 14px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; }
    td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
    tr:last-child td { border-bottom: none; }
    .section-title { font-size: 15px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 24px 0 10px; display: flex; align-items: center; gap: 8px; }
    .flow-card { background: #faf5ff; border: 2px solid #d8b4fe; border-radius: 16px; padding: 20px; margin-top: 24px; margin-bottom: 24px; }
    .flow-title { font-size: 17px; font-weight: 900; color: #581c87; margin: 0 0 4px; letter-spacing: -0.3px; }
    .flow-sub { font-size: 12px; font-weight: 700; color: #7e22ce; margin: 0 0 16px; }
    .flow-sec { margin-bottom: 20px; }
    .flow-sec:last-child { margin-bottom: 0; }
    .flow-sec-title { font-size: 13px; font-weight: 900; text-transform: uppercase; margin: 0 0 8px; display: flex; align-items: center; justify-content: space-between; }
    .attachments-note { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 14px 18px; color: #9a3412; font-size: 13px; font-weight: 600; margin-top: 24px; }
    .footer { background: #f8fafc; padding: 20px 28px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">Weekly Audit Report (Mon – Sun)</span>
      <h1 class="title">${storeName}</h1>
      <p class="subtitle"><strong>Branch:</strong> ${selectedBranchName} &nbsp;|&nbsp; <strong>Period:</strong> ${dateRange.label}</p>
    </div>

    <div class="content">
      <p style="font-size: 14px; color: #334155; margin-top: 0; line-height: 1.5;">
        Here is your weekly consolidated business report for the cycle <strong>${dateRange.startFormatted} (Monday)</strong> to <strong>${dateRange.endFormatted} (Sunday)</strong>. Attached are the detailed CSV records for comprehensive financial accounting.
      </p>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Total Gross Sales</div>
          <div class="stat-value highlight">₱${totalSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Net Estimated Profit</div>
          <div class="stat-value success">₱${totalProfit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Operating Expenses</div>
          <div class="stat-value danger">₱${totalExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Completed Transactions</div>
          <div class="stat-value">${transactionCount.toLocaleString()} orders</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Weekly Utang Added</div>
          <div class="stat-value danger">₱${totalWeeklyCredit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Outstanding Utang</div>
          <div class="stat-value">₱${totalUtang.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      ${includeDailySummary ? `
      <div class="section-title">📅 Daily Breakdown (Monday to Sunday)</div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Date / Day</th>
              <th>Orders</th>
              <th>Expenses</th>
              <th>Profit</th>
              <th style="text-align: right;">Sales (PHP)</th>
            </tr>
          </thead>
          <tbody>
            ${dailyBreakdownList.map(d => `
              <tr>
                <td><strong>${d.dateStr}</strong><br><span style="color:#64748b; font-size:11px;">${d.dayName}</span></td>
                <td>${d.transactions}</td>
                <td style="color:#dc2626;">₱${d.expenses.toFixed(2)}</td>
                <td style="color:#16a34a; font-weight:700;">₱${(d.sales - d.cost - d.expenses).toFixed(2)}</td>
                <td style="text-align: right; font-weight:800;">₱${d.sales.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      ${includeCreditReport ? `
      <div class="flow-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
          <div>
            <h3 class="flow-title">Weekly Flow: Credit &amp; Utang</h3>
            <div class="flow-sub">Cycle: ${dateRange.label}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #7e22ce;">Total Credit Amount</div>
            <div style="font-size: 18px; font-weight: 900; color: #9333ea;">₱${totalWeeklyCredit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <!-- 1. UTANG -->
        <div class="flow-sec">
          <div class="flow-sec-title" style="color: #991b1b;">
            <span>📌 Utang</span>
            <span style="font-size: 11px; background: #fee2e2; padding: 2px 8px; border-radius: 8px;">
              ${weeklyUtangList.length} entry${weeklyUtangList.length !== 1 ? 'ies' : ''}
            </span>
          </div>
          <div class="table-container" style="margin: 0; border-color: #fecaca;">
            <table>
              <thead>
                <tr style="background: #fef2f2;">
                  <th style="color: #991b1b;">Name</th>
                  <th style="color: #991b1b;">Date Credit</th>
                  <th style="color: #991b1b; text-align: right;">Amount</th>
                  <th style="color: #991b1b; text-align: right;">Kabuuang Total sa Utang</th>
                </tr>
              </thead>
              <tbody>
                ${weeklyUtangList.length > 0 ? weeklyUtangList.map(u => `
                  <tr>
                    <td><strong>${u.name}</strong></td>
                    <td style="color: #64748b;">${u.dateCredit}</td>
                    <td style="text-align: right; color: #dc2626; font-weight: 800;">₱${u.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td style="text-align: right; color: #7f1d1d; font-weight: 900;">₱${u.kabuuangTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="4" style="text-align: center; color: #64748b; font-style: italic;">No new credit entries recorded this week.</td></tr>
                `}
                <tr style="background: #fff1f2; font-weight: 900; border-top: 2px solid #fecaca;">
                  <td colspan="2" style="color: #991b1b; text-transform: uppercase;">Total Credit Amount:</td>
                  <td style="text-align: right; color: #b91c1c; font-size: 13px;">₱${totalWeeklyCredit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2. FULLY PAID -->
        <div class="flow-sec">
          <div class="flow-sec-title" style="color: #166534;">
            <span>✅ Fully Paid</span>
            <span style="font-size: 11px; background: #dcfce7; padding: 2px 8px; border-radius: 8px;">
              ${fullyPaidList.length} settled
            </span>
          </div>
          <div class="table-container" style="margin: 0; border-color: #bbf7d0;">
            <table>
              <thead>
                <tr style="background: #f0fdf4;">
                  <th style="color: #166534;">Name</th>
                  <th style="color: #166534;">Date of Payment</th>
                  <th style="color: #166534; text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${fullyPaidList.length > 0 ? fullyPaidList.map(f => `
                  <tr>
                    <td><strong>${f.name}</strong></td>
                    <td style="color: #64748b;">${f.dateOfPayment}</td>
                    <td style="text-align: right; color: #16a34a; font-weight: 800;">₱${f.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="3" style="text-align: center; color: #64748b; font-style: italic;">No fully paid debts this week.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 3. PARTIAL PAYMENT -->
        <div class="flow-sec">
          <div class="flow-sec-title" style="color: #1e40af;">
            <span>🔄 Partial Payment</span>
            <span style="font-size: 11px; background: #dbeafe; padding: 2px 8px; border-radius: 8px;">
              ${partialPaymentList.length} partial
            </span>
          </div>
          <div class="table-container" style="margin: 0; border-color: #bfdbfe;">
            <table>
              <thead>
                <tr style="background: #eff6ff;">
                  <th style="color: #1e40af;">Name</th>
                  <th style="color: #1e40af;">Date of Payment</th>
                  <th style="color: #1e40af; text-align: right;">Amount</th>
                  <th style="color: #1e40af; text-align: right;">Remaining Balance</th>
                </tr>
              </thead>
              <tbody>
                ${partialPaymentList.length > 0 ? partialPaymentList.map(p => `
                  <tr>
                    <td><strong>${p.name}</strong></td>
                    <td style="color: #64748b;">${p.dateOfPayment}</td>
                    <td style="text-align: right; color: #2563eb; font-weight: 800;">₱${p.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td style="text-align: right; color: #dc2626; font-weight: 800;">₱${p.remainingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="4" style="text-align: center; color: #64748b; font-style: italic;">No partial payments recorded this week.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="attachments-note">
        📎 <strong>Included Bundled Reports:</strong> ${includedTitles}<br>
        Download the attached CSV files (${attachments.length} attachment${attachments.length !== 1 ? 's' : ''}) directly to open them in Microsoft Excel or Google Sheets.
      </div>
    </div>

    <div class="footer">
      Generated automatically by Sari-Sari POS &bull; ${format(new Date(), 'PPpp')} &bull; Store TIN: ${store?.tin || 'NON-VAT'}
    </div>
  </div>
</body>
</html>
  `;

  return {
    subject,
    htmlBody,
    attachments,
    summaryStats: {
      totalSales,
      totalProfit,
      totalExpenses,
      transactionCount,
      totalUtang,
      vatCollected,
      weeklyUtangCount: weeklyUtangList.length,
      totalWeeklyCredit,
      fullyPaidCount: fullyPaidList.length,
      partialPaymentCount: partialPaymentList.length,
    },
  };
}
