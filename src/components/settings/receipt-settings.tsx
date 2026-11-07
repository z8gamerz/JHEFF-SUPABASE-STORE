'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/hooks/use-store';
import { ReceiptSettings as ReceiptSettingsType } from '@/lib/db/idb';
import { 
  Printer, 
  Save, 
  RotateCcw, 
  Check, 
  Store, 
  MapPin, 
  Phone, 
  Mail, 
  FileText, 
  MessageSquare, 
  Eye, 
  Settings2,
  Sparkles,
  Layers,
  Sliders,
  Type
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

export function ReceiptSettings() {
  const { store, updateReceiptSettings } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Form state
  const [headerTitle, setHeaderTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tin, setTin] = useState('');
  const [permitNumber, setPermitNumber] = useState('');
  const [orPrefix, setOrPrefix] = useState('OR-');
  const [ticketPrefix, setTicketPrefix] = useState('T-');
  const [headerGreeting, setHeaderGreeting] = useState('');
  const [footerGreeting, setFooterGreeting] = useState('Salamat Po! Balik Kayo!');
  const [policyNotice, setPolicyNotice] = useState('Palit-gamit sa loob ng 24 oras kasama ang resibo.\nBawal po ang utang.');
  const [disclaimer, setDisclaimer] = useState('Official Sales Invoice & Receipt');
  
  // Toggles
  const [showAddress, setShowAddress] = useState(true);
  const [showPhone, setShowPhone] = useState(true);
  const [showTin, setShowTin] = useState(true);
  const [showCashier, setShowCashier] = useState(true);
  const [showCustomer, setShowCustomer] = useState(true);
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(true);
  const [showDateTime, setShowDateTime] = useState(true);

  // Format
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [fontStyle, setFontStyle] = useState<'mono' | 'sans'>('mono');

  // Load existing settings or store defaults
  useEffect(() => {
    if (store) {
      const rs = store.receiptSettings || {};
      setHeaderTitle(rs.headerTitle ?? store.name ?? '');
      setTagline(rs.tagline ?? 'Ang Tindahan ng Bayan');
      setAddress(rs.address ?? store.address ?? '');
      setPhone(rs.phone ?? '+63 917 123 4567');
      setEmail(rs.email ?? '');
      setTin(rs.tin ?? store.tin ?? '');
      setPermitNumber(rs.permitNumber ?? 'BP-2025-0819');
      setOrPrefix(rs.orPrefix ?? 'OR-');
      setTicketPrefix(rs.ticketPrefix ?? 'T-');
      setHeaderGreeting(rs.headerGreeting ?? 'Maraming salamat sa pagtangkilik!');
      setFooterGreeting(rs.footerGreeting ?? 'Salamat Po! Balik Kayo!');
      setPolicyNotice(rs.policyNotice ?? 'Palit-gamit sa loob ng 24 oras kasama ang resibo.\nBawal po ang utang.');
      setDisclaimer(rs.disclaimer ?? 'Official Sales Invoice & Receipt');
      
      setShowAddress(rs.showAddress ?? true);
      setShowPhone(rs.showPhone ?? true);
      setShowTin(rs.showTin ?? true);
      setShowCashier(rs.showCashier ?? true);
      setShowCustomer(rs.showCustomer ?? true);
      setShowTaxBreakdown(rs.showTaxBreakdown ?? true);
      setShowDateTime(rs.showDateTime ?? true);

      setPaperWidth(rs.paperWidth ?? '80mm');
      setFontStyle(rs.fontStyle ?? 'mono');
    }
  }, [store]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: ReceiptSettingsType = {
        headerTitle,
        tagline,
        address,
        phone,
        email,
        tin,
        permitNumber,
        orPrefix,
        ticketPrefix,
        headerGreeting,
        footerGreeting,
        policyNotice,
        disclaimer,
        showAddress,
        showPhone,
        showTin,
        showCashier,
        showCustomer,
        showTaxBreakdown,
        showDateTime,
        paperWidth,
        fontStyle,
        updatedAt: Date.now(),
      };
      await updateReceiptSettings(payload);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to save receipt settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (confirm('Ibalik sa standard default receipt settings?')) {
      setHeaderTitle(store?.name || 'Sari-Sari Store');
      setTagline('Ang Tindahan ng Bayan');
      setAddress(store?.address || 'Poblacion, Brgy. Central, Manila');
      setPhone('+63 917 123 4567');
      setEmail('');
      setTin(store?.tin || '000-123-456-000');
      setPermitNumber('BP-2025-0819');
      setOrPrefix('OR-');
      setTicketPrefix('T-');
      setHeaderGreeting('Maraming salamat sa pagtangkilik!');
      setFooterGreeting('Salamat Po! Balik Kayo!');
      setPolicyNotice('Palit-gamit sa loob ng 24 oras kasama ang resibo.\nBawal po ang utang.');
      setDisclaimer('Official Sales Invoice & Receipt');
      setShowAddress(true);
      setShowPhone(true);
      setShowTin(true);
      setShowCashier(true);
      setShowCustomer(true);
      setShowTaxBreakdown(true);
      setShowDateTime(true);
      setPaperWidth('80mm');
      setFontStyle('mono');
    }
  };

  const handlePrintTest = () => {
    window.print();
  };

  // Sample receipt items for preview
  const sampleItems = [
    { name: 'Coke Mismo 290ml', qty: 2, unit: 'pc', price: 20, isWeight: false },
    { name: 'Bawang / Garlic', qty: 0.25, unit: 'kg', price: 180, isWeight: true },
    { name: 'Alaska Evap 370ml', qty: 1, unit: 'can', price: 38, isWeight: false },
  ];
  const sampleSubtotal = (2 * 20) + (0.25 * 180) + (1 * 38); // 40 + 45 + 38 = 123
  const sampleVat = (sampleSubtotal / 1.12) * 0.12;
  const sampleVatable = sampleSubtotal - sampleVat;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="p-6 md:p-8 bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-800 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-orange-100 dark:bg-orange-950/60 p-4 rounded-2xl text-orange-600 dark:text-orange-400 shadow-sm">
              <Printer className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-2xl text-gray-900 dark:text-white tracking-tight">
                  Receipt Customizer
                </h2>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
                  POS &amp; Thermal
                </span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mt-1">
                I-customize ang lahat ng detalye sa resibo bukod sa mga nabiling paninda (Header, Tagline, Permit, TIN, Greetings, at Policies).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              type="button"
              onClick={handlePrintTest}
              className="px-4 py-3 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border border-blue-200 dark:border-blue-800"
            >
              <Printer className="w-4 h-4" />
              Print Test
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Form Controls (Left) vs Live Thermal Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Form: 7 cols */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-6">
          
          {/* Card 1: Store & Header Identity */}
          <div className="p-6 md:p-8 bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-800 space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <Store className="w-5 h-5 text-orange-600" />
              <h3 className="font-black text-lg text-gray-900 dark:text-white">Store &amp; Header Identity</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Store Name sa Resibo
                </label>
                <input
                  type="text"
                  value={headerTitle}
                  onChange={(e) => setHeaderTitle(e.target.value)}
                  placeholder={store?.name || 'Hal. Aling Nena Tindahan'}
                  className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Slogan / Tagline
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Hal. Ang Tindahan ng Bayan"
                  className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Address sa Resibo
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Hal. #123 Rizal St., Brgy. Poblacion, Quezon City"
                className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Contact / Telepono
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Hal. 0917-123-4567 / (02) 8123-4567"
                  className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Email (Opsyonal)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Hal. tindahan@gmail.com"
                  className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Legal, BIR & Prefixes */}
          <div className="p-6 md:p-8 bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-800 space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <FileText className="w-5 h-5 text-blue-600" />
              <h3 className="font-black text-lg text-gray-900 dark:text-white">Legal, BIR &amp; Prefix Codes</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  BIR TIN Number
                </label>
                <input
                  type="text"
                  value={tin}
                  onChange={(e) => setTin(e.target.value)}
                  placeholder="Hal. 123-456-789-000"
                  className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Business Permit / DTI No.
                </label>
                <input
                  type="text"
                  value={permitNumber}
                  onChange={(e) => setPermitNumber(e.target.value)}
                  placeholder="Hal. BP-2025-0819"
                  className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Official Receipt Prefix
                </label>
                <input
                  type="text"
                  value={orPrefix}
                  onChange={(e) => setOrPrefix(e.target.value)}
                  placeholder="OR-"
                  className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  Ticket / POS Prefix
                </label>
                <input
                  type="text"
                  value={ticketPrefix}
                  onChange={(e) => setTicketPrefix(e.target.value)}
                  placeholder="T-"
                  className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Receipt Title / Sub-header
              </label>
              <input
                type="text"
                value={disclaimer}
                onChange={(e) => setDisclaimer(e.target.value)}
                placeholder="Official Sales Invoice & Receipt"
                className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          </div>

          {/* Card 3: Custom Greetings, Thank You & Store Policy */}
          <div className="p-6 md:p-8 bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-800 space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              <h3 className="font-black text-lg text-gray-900 dark:text-white">Greetings, Thank You &amp; Store Policies</h3>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Welcome / Header Greeting
              </label>
              <input
                type="text"
                value={headerGreeting}
                onChange={(e) => setHeaderGreeting(e.target.value)}
                placeholder="Hal. Welcome! Maraming salamat sa pagtangkilik!"
                className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Footer Thank You Note
              </label>
              <input
                type="text"
                value={footerGreeting}
                onChange={(e) => setFooterGreeting(e.target.value)}
                placeholder="Hal. Salamat Po! Balik Kayo Muli!"
                className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Return / Exchange &amp; Utang Policy Notice
              </label>
              <textarea
                rows={3}
                value={policyNotice}
                onChange={(e) => setPolicyNotice(e.target.value)}
                placeholder="Palit-gamit sa loob ng 24 oras kasama ang resibo. Bawal po ang utang."
                className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none resize-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Lilitaw sa pinakababa ng resibo. Pwedeng ilagay ang no-return policy o paalala ukol sa utang.
              </p>
            </div>
          </div>

          {/* Card 4: Paper Size, Font Style & Visibility Toggles */}
          <div className="p-6 md:p-8 bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-800 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <Sliders className="w-5 h-5 text-purple-600" />
              <h3 className="font-black text-lg text-gray-900 dark:text-white">Printer Format &amp; Visibility Toggles</h3>
            </div>

            {/* Paper Width & Font Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Lapad ng Thermal Paper
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaperWidth('80mm')}
                    className={`py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                      paperWidth === '80mm'
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-orange-300'
                    }`}
                  >
                    80mm (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperWidth('58mm')}
                    className={`py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                      paperWidth === '58mm'
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-orange-300'
                    }`}
                  >
                    58mm (Mini)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Estilo ng Font sa Resibo
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFontStyle('mono')}
                    className={`py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                      fontStyle === 'mono'
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-orange-300'
                    }`}
                  >
                    Monospace (Courier)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFontStyle('sans')}
                    className={`py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                      fontStyle === 'sans'
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-orange-300'
                    }`}
                  >
                    Modern Sans
                  </button>
                </div>
              </div>
            </div>

            {/* Visibility Toggles Grid */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">
                I-toggle ang mga Elementong Ipi-print
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Address ng Tindahan', state: showAddress, setter: setShowAddress },
                  { label: 'Contact / Phone', state: showPhone, setter: setShowPhone },
                  { label: 'BIR TIN Number', state: showTin, setter: setShowTin },
                  { label: 'Petsa at Oras (Date & Time)', state: showDateTime, setter: setShowDateTime },
                  { label: 'Pangalan ng Cashier', state: showCashier, setter: setShowCashier },
                  { label: 'Pangalan ng Customer', state: showCustomer, setter: setShowCustomer },
                  { label: 'VAT / Tax Breakdown', state: showTaxBreakdown, setter: setShowTaxBreakdown },
                ].map((item, idx) => (
                  <label
                    key={idx}
                    className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-orange-300 transition-colors"
                  >
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={item.state}
                      onChange={(e) => item.setter(e.target.checked)}
                      className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Save Button & Feedback */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-orange-500/20 cursor-pointer uppercase tracking-wider text-sm border-none"
            >
              <Save className="w-5 h-5" />
              {isSaving ? 'Ise-save...' : 'I-save ang Receipt Settings'}
            </button>

            <AnimatePresence>
              {showSuccess && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs font-bold border border-emerald-300 dark:border-emerald-800 shrink-0"
                >
                  <Check className="w-4 h-4" />
                  Na-save na ang Resibo!
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </form>

        {/* Right Column: Live Thermal Paper Preview */}
        <div className="lg:col-span-5 sticky top-24 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <Eye className="w-4 h-4 text-orange-600" />
              Live Thermal Paper Preview
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              {paperWidth} • {fontStyle.toUpperCase()}
            </span>
          </div>

          {/* Thermal Paper Container */}
          <div className="bg-gray-200 dark:bg-gray-800 p-4 sm:p-6 rounded-[2.5rem] shadow-inner flex justify-center border border-gray-300 dark:border-gray-700">
            <div
              id="printable-receipt"
              ref={previewRef}
              className={`bg-white shadow-xl p-5 text-black transition-all ${
                paperWidth === '58mm' ? 'w-[58mm] min-w-[220px]' : 'w-[80mm] min-w-[280px]'
              } ${fontStyle === 'sans' ? 'font-sans' : 'font-mono'} text-[12px] leading-tight select-none`}
              style={{
                fontFamily: fontStyle === 'sans' ? 'system-ui, -apple-system, sans-serif' : "'Courier New', Courier, monospace"
              }}
            >
              {/* Receipt Header */}
              <div className="text-center">
                <h2 className="text-base sm:text-lg font-black uppercase tracking-tight leading-tight">
                  {headerTitle || store?.name || 'SARI-SARI POS'}
                </h2>
                {tagline && (
                  <p className="text-[10px] italic font-medium opacity-80 mt-0.5">{tagline}</p>
                )}
                {showAddress && address && (
                  <p className="text-[10px] font-bold leading-tight mt-0.5">{address}</p>
                )}
                {showPhone && phone && (
                  <p className="text-[10px] font-medium leading-tight">Tel: {phone}</p>
                )}
                {showTin && tin && (
                  <p className="text-[10px] font-bold leading-tight">TIN: {tin}</p>
                )}
                {permitNumber && (
                  <p className="text-[9px] font-medium opacity-75">Permit #: {permitNumber}</p>
                )}
                {headerGreeting && (
                  <p className="text-[9px] font-medium opacity-80 mt-1 italic border-y border-dotted border-black/30 py-0.5">
                    {headerGreeting}
                  </p>
                )}

                <div className="border-t border-dashed border-black my-2.5" />

                <div className="space-y-0.5 mb-3 text-left text-[10px]">
                  <div className="flex justify-between">
                    <span>Ticket:</span>
                    <span className="font-bold">{ticketPrefix}10024</span>
                  </div>
                  <div className="flex justify-between">
                    <span>OR Number:</span>
                    <span className="font-bold">{orPrefix}000128</span>
                  </div>
                  {showDateTime && (
                    <>
                      <div className="flex justify-between">
                        <span>Date:</span>
                        <span>{format(new Date(), 'MMM dd, yyyy')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Time:</span>
                        <span>{format(new Date(), 'hh:mm a')}</span>
                      </div>
                    </>
                  )}
                  {showCashier && (
                    <div className="flex justify-between">
                      <span>Cashier:</span>
                      <span className="font-bold">Admin (Cashier 1)</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <span className="uppercase font-bold">{disclaimer || 'Official Sales Receipt'}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-black my-2.5" />
              </div>

              {/* Sample Purchased Items Table */}
              <div className="space-y-1.5 mb-3">
                <div className="flex justify-between font-bold text-[10px] uppercase border-b border-black/20 pb-1">
                  <span className="w-1/2">Item</span>
                  <span className="w-1/4 text-center">Qty/Wt</span>
                  <span className="w-1/4 text-right">Price</span>
                </div>
                {sampleItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-[11px]">
                    <div className="w-1/2 break-words pr-1">
                      <span className="font-bold">{item.name}</span>
                      {item.isWeight && (
                        <span className="block text-[9px] opacity-75">
                          @ ₱{item.price.toFixed(2)}/{item.unit}
                        </span>
                      )}
                    </div>
                    <span className="w-1/4 text-center font-bold">
                      {item.qty} {item.unit}
                    </span>
                    <span className="w-1/4 text-right font-bold">
                      ₱{(item.price * item.qty).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Receipt Totals & Footer */}
              <div className="border-t border-dashed border-black my-2.5" />
              <div className="space-y-1 mb-4">
                {showTaxBreakdown && (
                  <div className="space-y-0.5 mb-2 text-[10px] opacity-70">
                    <div className="flex justify-between">
                      <span>VATable Sales:</span>
                      <span>₱{sampleVatable.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>VAT (12%):</span>
                      <span>₱{sampleVat.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold">
                  <span>TOTAL:</span>
                  <span>₱{sampleSubtotal.toFixed(2)}</span>
                </div>

                <div className="pt-2 border-t border-dashed border-black/40 space-y-1 text-[10px]">
                  <div className="flex justify-between font-bold">
                    <span>Payment Mode:</span>
                    <span className="uppercase">CASH</span>
                  </div>
                  {showCustomer && (
                    <div className="flex justify-between opacity-80">
                      <span>Customer:</span>
                      <span className="font-bold uppercase">Suki Walk-in</span>
                    </div>
                  )}
                  <div className="flex justify-between opacity-80">
                    <span>Amount Tendered:</span>
                    <span>₱150.00</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Change:</span>
                    <span>₱{(150 - sampleSubtotal).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Custom Greetings & Policies */}
              <div className="text-center mt-5 space-y-1 border-t border-dashed border-black/40 pt-3">
                <p className="font-bold uppercase text-[11px] tracking-wide">
                  {footerGreeting || 'Salamat Po! Balik Kayo!'}
                </p>
                {policyNotice && (
                  <p className="text-[8px] opacity-75 leading-tight px-1 whitespace-pre-line">
                    {policyNotice}
                  </p>
                )}
                {disclaimer && (
                  <p className="text-[8px] opacity-40 mt-1.5 italic">{disclaimer}</p>
                )}
                <p className="text-[8px] opacity-35">Powered by Sari-Sari POS</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-2xl border border-orange-200 dark:border-orange-800 text-xs text-orange-800 dark:text-orange-300">
            <span className="font-bold block mb-1">💡 Real-time Preview:</span>
            Ang anumang babaguhin mo sa kaliwang form ay agad na sumasalamin dito sa resibo at mailalapat sa lahat ng bagong transaksyon sa POS checkout.
          </div>
        </div>
      </div>
    </div>
  );
}
