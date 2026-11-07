'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Mail, 
  Send, 
  Calendar, 
  CheckSquare, 
  Square, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileSpreadsheet, 
  FileText, 
  Users, 
  ArrowRight, 
  Settings, 
  TrendingUp,
  Receipt,
  Sparkles,
  Info,
  Download
} from 'lucide-react';
import Link from 'next/link';
import { metadataService } from '@/lib/services/metadata-service';
import { auditService } from '@/lib/services/audit-service';
import { customerService } from '@/lib/services/customer-service';
import { useAuth } from '@/lib/contexts/auth-context';
import { useStore } from '@/lib/hooks/use-store';
import { Transaction, Customer, Expense, Branch, CreditEntry } from '@/lib/db/idb';
import { 
  DateRange, 
  getThisWeekMonSun, 
  getLastWeekMonSun, 
  createCustomMonSunRange 
} from '@/lib/utils/weekly-date';
import { generateReportEmailData } from '@/lib/utils/report-email-formatter';
import { apiFetch } from '@/lib/api-client';

interface EmailReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBranchId: string;
  branches: Branch[];
  transactions: Transaction[];
  expenses: Expense[];
  customers: Customer[];
}

type WeekPreset = 'this_week' | 'last_week' | 'custom';

export function EmailReportModal({
  isOpen,
  onClose,
  selectedBranchId,
  branches,
  transactions,
  expenses,
  customers,
}: EmailReportModalProps) {
  const { user } = useAuth();
  const { store } = useStore();

  // SMTP: server-configured by default. Client never loads/persists app passwords.
  const [senderEmail, setSenderEmail] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [hasLoadedCredentials, setHasLoadedCredentials] = useState(false);
  const [creditEntries, setCreditEntries] = useState<CreditEntry[]>([]);

  // Selection states
  const [weekPreset, setWeekPreset] = useState<WeekPreset>('last_week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Report bundle toggles
  const [includeDailySummary, setIncludeDailySummary] = useState(true);
  const [includeSalesJournal, setIncludeSalesJournal] = useState(true);
  const [includeCreditReport, setIncludeCreditReport] = useState(true);

  // Status & Progress
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    async function loadConfigAndEntries() {
      try {
        const [senderEntry, recipientEntry, cEntries] = await Promise.all([
          metadataService.get('email_smtp_sender'),
          metadataService.get('email_default_recipient'),
          customerService.getAllCreditEntries(selectedBranchId === 'all' ? undefined : selectedBranchId),
        ]);
        if (senderEntry?.value) setSenderEmail(senderEntry.value);
        if (recipientEntry?.value) setRecipientEmail(recipientEntry.value);
        if (cEntries) setCreditEntries(cEntries);
      } catch (err) {
        console.error('Failed to load email config or credit entries:', err);
      } finally {
        setHasLoadedCredentials(true);
      }
    }
    loadConfigAndEntries();
    const lastWeek = getLastWeekMonSun();
    setCustomStart(lastWeek.startFormatted);
    setCustomEnd(lastWeek.endFormatted);
    setSendSuccess(false);
    setErrorMessage(null);
  }, [isOpen, selectedBranchId]);

  // Determine active date range based on Monday–Sunday preset
  const activeDateRange: DateRange = useMemo(() => {
    if (weekPreset === 'this_week') {
      return getThisWeekMonSun();
    }
    if (weekPreset === 'last_week') {
      return getLastWeekMonSun();
    }
    return createCustomMonSunRange(
      customStart || getLastWeekMonSun().startFormatted, 
      customEnd || getLastWeekMonSun().endFormatted
    );
  }, [weekPreset, customStart, customEnd]);

  // Branch Name
  const branchName = useMemo(() => {
    if (selectedBranchId === 'all') return 'All Branches';
    const b = branches.find(item => item.id === selectedBranchId);
    return b ? b.name : 'All Branches';
  }, [selectedBranchId, branches]);

  // Filter transactions and compute live preview
  const generatedData = useMemo(() => {
    return generateReportEmailData({
      dateRange: activeDateRange,
      store,
      selectedBranchName: branchName,
      transactions,
      expenses,
      customers,
      creditEntries,
      includeDailySummary,
      includeSalesJournal,
      includeCreditReport,
    });
  }, [
    activeDateRange,
    store,
    branchName,
    transactions,
    expenses,
    customers,
    creditEntries,
    includeDailySummary,
    includeSalesJournal,
    includeCreditReport,
  ]);

  // SMTP is server-configured (SMTP_APP_PASSWORD). Recipient/default sender are display/config only.
  const smtpServerConfigured = true;
  const isAnyReportSelected = includeDailySummary || includeSalesJournal || includeCreditReport;

  const handleDownloadCSVs = () => {
    if (!generatedData.attachments || generatedData.attachments.length === 0) return;
    for (const att of generatedData.attachments) {
      const blob = new Blob([att.content], { type: `${att.contentType || 'text/csv'};charset=utf-8;` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = att.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleSendEmail = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setErrorMessage('Please enter a valid recipient email address.');
      return;
    }
    if (!isAnyReportSelected) {
      setErrorMessage('Please select at least one report to include.');
      return;
    }

    setIsSending(true);
    setErrorMessage(null);

    try {
      const response = await apiFetch('/api/send-report-email', {
        method: 'POST',
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          subject: generatedData.subject,
          htmlBody: generatedData.htmlBody,
          attachments: generatedData.attachments,
        }),
      });

      const responseText = await response.text();
      let result: any = null;
      try {
        result = responseText ? JSON.parse(responseText) : null;
      } catch {
        console.error('Non-JSON response from /api/send-report-email:', responseText);
      }

      if (!response.ok || !result || !result.success) {
        const fallbackMsg = response.status === 404 || response.status === 405
          ? `Serverless endpoint not found (${response.status}). Verify Vercel /api deployment.`
          : `Failed to dispatch email (HTTP ${response.status}). Check Gmail App Password.`;
        throw new Error(result?.error || fallbackMsg);
      }

      await auditService.log(
        'REPORT_EMAIL_SENT',
        JSON.stringify({
          recipient: recipientEmail.trim(),
          dateRange: activeDateRange.label,
          branch: branchName,
          reportsIncluded: {
            dailySummary: includeDailySummary,
            salesJournal: includeSalesJournal,
            creditReport: includeCreditReport,
          },
          messageId: result.messageId,
        }),
        user?.name || 'Authorized User'
      );

      setSendSuccess(true);
    } catch (err: any) {
      console.error('Send report email error:', err);
      setErrorMessage(err?.message || 'An error occurred while sending the email.');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 px-8 py-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight leading-tight">Email Weekly Business Report</h3>
              <p className="text-xs text-orange-100 font-semibold mt-1">
                Mon – Sun Cycle &bull; Clean HTML Digest &amp; CSV Attachments
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 md:p-8 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* SMTP server status */}
          {hasLoadedCredentials && (
            <div className="p-4 bg-blue-50/70 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 font-medium">
              Email is sent using server-configured SMTP (<code>SMTP_SENDER_EMAIL</code>/<code>SMTP_APP_PASSWORD</code>). Passwords are never stored in the browser.
            </div>
          )}

          {/* Success Screen */}
          {sendSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                Weekly Report Sent!
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-300 font-medium max-w-md mx-auto leading-relaxed">
                The consolidated audit report for <strong>{activeDateRange.label}</strong> has been delivered to <strong>{recipientEmail}</strong> with {generatedData.attachments.length} attached CSV spreadsheet{generatedData.attachments.length > 1 ? 's' : ''}.
              </p>
              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSendSuccess(false);
                    onClose();
                  }}
                  className="px-8 py-3.5 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-black transition-all cursor-pointer"
                >
                  Close Window
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Monday-Sunday Date Range Picker */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-600" />
                    1. Select Weekly Cycle (Monday – Sunday)
                  </label>
                  <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                    Strict Mon–Sun Standard
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setWeekPreset('last_week')}
                    className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                      weekPreset === 'last_week'
                        ? 'border-orange-600 bg-orange-50/60 dark:bg-orange-950/30 ring-2 ring-orange-500/20'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    <div className="text-xs font-black text-gray-900 dark:text-white">Last Week</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-0.5">
                      Full Mon – Sun
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWeekPreset('this_week')}
                    className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                      weekPreset === 'this_week'
                        ? 'border-orange-600 bg-orange-50/60 dark:bg-orange-950/30 ring-2 ring-orange-500/20'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    <div className="text-xs font-black text-gray-900 dark:text-white">This Week</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-0.5">
                      Mon – Present
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWeekPreset('custom')}
                    className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                      weekPreset === 'custom'
                        ? 'border-orange-600 bg-orange-50/60 dark:bg-orange-950/30 ring-2 ring-orange-500/20'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    <div className="text-xs font-black text-gray-900 dark:text-white">Custom Range</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-0.5">
                      Select Mon &amp; Sun
                    </div>
                  </button>
                </div>

                {/* Custom Date Pickers */}
                {weekPreset === 'custom' && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 block mb-1">
                        Start Date (Monday)
                      </label>
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 dark:text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 block mb-1">
                        End Date (Sunday)
                      </label>
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 dark:text-white outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="text-xs font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-4 py-2.5 rounded-xl flex items-center justify-between">
                  <span>Selected Range:</span>
                  <span className="text-orange-600 dark:text-orange-400 font-black">
                    {activeDateRange.label}
                  </span>
                </div>
              </div>

              {/* Step 2: Choose Bundled Reports */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-orange-600" />
                  2. Choose Reports to Bundle (Optional Multi-Select)
                </label>

                <div className="space-y-2">
                  {/* Daily Summary */}
                  <div
                    onClick={() => setIncludeDailySummary(!includeDailySummary)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      includeDailySummary 
                        ? 'border-orange-500 bg-orange-50/40 dark:bg-orange-950/20' 
                        : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${includeDailySummary ? 'bg-orange-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-gray-900 dark:text-white">Daily Summary</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                          Monday-to-Sunday breakdown of gross sales, estimated profit, expenses, and VAT.
                        </div>
                      </div>
                    </div>
                    {includeDailySummary ? (
                      <CheckSquare className="w-5 h-5 text-orange-600 shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 shrink-0" />
                    )}
                  </div>

                  {/* Sales Journal */}
                  <div
                    onClick={() => setIncludeSalesJournal(!includeSalesJournal)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      includeSalesJournal 
                        ? 'border-orange-500 bg-orange-50/40 dark:bg-orange-950/20' 
                        : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${includeSalesJournal ? 'bg-orange-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                        <Receipt className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-gray-900 dark:text-white">Sales Journal</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                          Granular Official Receipt (OR) log with timestamp, payment method, items count, and total.
                        </div>
                      </div>
                    </div>
                    {includeSalesJournal ? (
                      <CheckSquare className="w-5 h-5 text-orange-600 shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 shrink-0" />
                    )}
                  </div>

                  {/* Credit & Utang Report */}
                  <div
                    onClick={() => setIncludeCreditReport(!includeCreditReport)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      includeCreditReport 
                        ? 'border-purple-500 bg-purple-50/40 dark:bg-purple-950/20' 
                        : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${includeCreditReport ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-gray-900 dark:text-white flex items-center gap-2">
                          Credit &amp; Utang
                          <span className="text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-extrabold px-2 py-0.5 rounded-full uppercase">
                            Weekly Flow
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                          Strict Weekly Flow: Utang (Name, Date, Amount, Kabuuang Total sa Utang), Fully Paid, &amp; Partial Payment (Remaining Balance).
                        </div>
                      </div>
                    </div>
                    {includeCreditReport ? (
                      <CheckSquare className="w-5 h-5 text-purple-600 shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 shrink-0" />
                    )}
                  </div>
                </div>
              </div>

              {/* Step 3: Recipient & Sender */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-orange-600" />
                    3. Recipient Email Address
                  </span>
                  {senderEmail && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                      Sending via: <strong className="text-gray-800 dark:text-gray-200">{senderEmail}</strong>
                    </span>
                  )}
                </label>

                <input
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="e.g. storeowner@gmail.com, bookkeeper@gmail.com"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-3.5 font-bold text-gray-950 dark:text-white focus:ring-4 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition-all outline-none text-xs"
                />
              </div>

              {/* Live Preview Summary Card */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Live Period Snapshot ({branchName})
                  </span>
                  <div className="flex items-center gap-2">
                    {generatedData.attachments.length > 0 && (
                      <button
                        type="button"
                        onClick={handleDownloadCSVs}
                        title="Download all selected report CSV files"
                        className="text-[10px] font-black uppercase bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        Download CSVs
                      </button>
                    )}
                    <span className="text-[10px] font-black uppercase bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">
                      {generatedData.attachments.length} CSV Attached
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="text-[10px] font-bold text-gray-500 uppercase">Gross Sales</div>
                    <div className="text-sm font-black text-orange-600 dark:text-orange-400 mt-0.5">
                      ₱{generatedData.summaryStats.totalSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="text-[10px] font-bold text-gray-500 uppercase">Profit</div>
                    <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                      ₱{generatedData.summaryStats.totalProfit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="text-[10px] font-bold text-gray-500 uppercase">Total Utang</div>
                    <div className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">
                      ₱{generatedData.summaryStats.totalUtang.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Weekly Flow Snapshot */}
                {includeCreditReport && (
                  <div className="pt-2.5 border-t border-gray-200 dark:border-gray-700/80 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-purple-50 dark:bg-purple-950/40 p-2 rounded-xl border border-purple-100 dark:border-purple-900/60">
                      <div className="text-[9px] font-bold text-purple-700 dark:text-purple-300 uppercase">
                        Utang Added ({generatedData.summaryStats.weeklyUtangCount})
                      </div>
                      <div className="text-xs font-black text-purple-900 dark:text-purple-200 mt-0.5">
                        ₱{generatedData.summaryStats.totalWeeklyCredit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/60">
                      <div className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                        Fully Paid
                      </div>
                      <div className="text-xs font-black text-emerald-900 dark:text-emerald-200 mt-0.5">
                        {generatedData.summaryStats.fullyPaidCount} settled
                      </div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/40 p-2 rounded-xl border border-blue-100 dark:border-blue-900/60">
                      <div className="text-[9px] font-bold text-blue-700 dark:text-blue-300 uppercase">
                        Partial Paid
                      </div>
                      <div className="text-xs font-black text-blue-900 dark:text-blue-200 mt-0.5">
                        {generatedData.summaryStats.partialPaymentCount} accounts
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs space-y-3">
                  <div className="flex items-start gap-2.5 font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                    <span className="leading-relaxed">{errorMessage}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6 pt-1">
                    <button
                      type="button"
                      onClick={handleDownloadCSVs}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Download className="w-3.5 h-3.5" />
                      I-download ang CSV Reports
                    </button>
                    <span className="text-[11px] text-rose-800 dark:text-rose-300 font-semibold">
                      Maaari mong i-download agad ang buong report habang inaayos ang Gmail App Password.
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!sendSuccess && (
          <div className="px-8 py-5 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-6 py-3 text-xs font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSendEmail}
              disabled={isSending || !smtpServerConfigured || !isAnyReportSelected}
              className="bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black px-8 py-3.5 rounded-2xl flex items-center gap-2 text-xs uppercase tracking-wider shadow-lg shadow-orange-500/20 transition-all cursor-pointer border-none disabled:opacity-40"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending Weekly Report...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Weekly Report (Mon – Sun)
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
