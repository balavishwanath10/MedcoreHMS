import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Layers,
  Activity,
  ArrowRight,
} from 'lucide-react';
import {
  fetchInvoices,
  fetchInvoiceById,
  createInvoice,
  generateInvoiceFromEncounter,
  recordInvoicePayment,
  fetchInvoicePayments,
  fetchEncounters,
} from '../services/api';

export const BillingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'invoices' | 'generator' | 'tpa'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [encounters, setEncounters] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter states
  const [searchInvoice, setSearchInvoice] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [paymentData, setPaymentData] = useState({
    paymentMethod: 'CASH',
    amount: 0,
    currency: 'USD',
    transactionReference: '',
    idempotencyKey: '',
  });

  // Invoice Detail Modal State
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeInvoiceDetail, setActiveInvoiceDetail] = useState<any | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);

  // Manual Invoice Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newInvoiceData, setNewInvoiceData] = useState({
    patientId: '',
    items: [
      {
        itemType: 'CONSULTATION',
        description: 'Specialist Consultation',
        quantity: 1,
        unitPrice: 75.0,
      },
    ],
    discountAmount: 0,
    taxRatePercent: 5,
  });

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'invoices') {
        const data = await fetchInvoices({
          status: statusFilter || undefined,
          invoiceNumber: searchInvoice || undefined,
        });
        setInvoices(data);
      } else if (activeTab === 'generator') {
        const encList = await fetchEncounters();
        setEncounters(encList);
      } else if (activeTab === 'tpa') {
        const data = await fetchInvoices();
        setInvoices(data.filter((inv: any) => Boolean(inv.tpaClaim)));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load billing records');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPayment = (inv: any) => {
    setSelectedInvoice(inv);
    setPaymentData({
      paymentMethod: 'CASH',
      amount: inv.balanceDue,
      currency: 'USD',
      transactionReference: `PAY-${Date.now()}`,
      idempotencyKey: `IDEMP-${inv._id}-${Date.now()}`,
    });
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    setLoading(true);
    setError(null);
    try {
      await recordInvoicePayment(selectedInvoice._id, {
        ...paymentData,
        amount: Number(paymentData.amount),
      });
      setSuccessMsg(
        `Payment of $${paymentData.amount} recorded successfully for ${selectedInvoice.invoiceNumber}`,
      );
      setShowPaymentModal(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (inv: any) => {
    try {
      const full = await fetchInvoiceById(inv._id);
      setActiveInvoiceDetail(full);
      const payments = await fetchInvoicePayments(inv._id);
      setPaymentHistory(payments);
      setShowDetailModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice details');
    }
  };

  const handleGenerateFromEncounter = async (encounterId: string) => {
    setLoading(true);
    setError(null);
    try {
      const invoice = await generateInvoiceFromEncounter(encounterId);
      setSuccessMsg(`Itemized invoice ${invoice.invoiceNumber} created from encounter!`);
      setActiveTab('invoices');
    } catch (err: any) {
      setError(err.message || 'Failed to generate invoice from encounter');
    } finally {
      setLoading(false);
    }
  };

  const handleManualCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvoiceData.patientId) {
      setError('Please provide a valid Patient Profile ID');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createInvoice({
        patientId: newInvoiceData.patientId,
        lineItems: newInvoiceData.items.map((it) => ({
          ...it,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
        discountAmount: Number(newInvoiceData.discountAmount),
        taxRatePercent: Number(newInvoiceData.taxRatePercent),
      });
      setSuccessMsg('Manual invoice created successfully!');
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create manual invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="w-7 h-7 text-indigo-600" />
            Billing, Invoices & Payment Gateway
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Itemized clinical invoicing, encounter auto-aggregation, payment reconciliation, and TPA
            insurance claims.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'invoices' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" />
              New Invoice
            </button>
          )}
          <button
            onClick={loadData}
            className="p-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'invoices'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Invoices & Payments ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('generator')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'generator'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          Encounter Aggregator ({encounters.length})
        </button>
        <button
          onClick={() => setActiveTab('tpa')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'tpa'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          TPA Insurance Claims
        </button>
      </div>

      {/* TAB 1: Invoices Table */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search by invoice number (e.g. INV-2026-0001)..."
                value={searchInvoice}
                onChange={(e) => setSearchInvoice(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="ISSUED">ISSUED</option>
              <option value="PARTIALLY_PAID">PARTIALLY_PAID</option>
              <option value="PAID">PAID</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Patient ID</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">Paid / Balance Due</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      No invoices found. Generate from encounters or click "New Invoice".
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv._id} className="hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-700">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{inv.patientId}</td>
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(inv.issuedAt || inv.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        ${inv.totalAmount?.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        <span className="text-emerald-700 font-bold">
                          ${inv.paidAmount?.toFixed(2)}
                        </span>{' '}
                        /{' '}
                        <span
                          className={
                            inv.balanceDue > 0 ? 'text-red-600 font-bold' : 'text-gray-500'
                          }
                        >
                          ${inv.balanceDue?.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            inv.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'PARTIALLY_PAID'
                                ? 'bg-amber-100 text-amber-800'
                                : inv.status === 'ISSUED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleViewDetails(inv)}
                          className="px-2.5 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition"
                        >
                          Details
                        </button>
                        {inv.status !== 'PAID' && (
                          <button
                            onClick={() => handleOpenPayment(inv)}
                            className="px-2.5 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 transition"
                          >
                            Pay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Encounter Aggregator */}
      {activeTab === 'generator' && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-indigo-900 text-sm flex items-start gap-3">
            <Activity className="w-5 h-5 flex-shrink-0 mt-0.5 text-indigo-600" />
            <div>
              <p className="font-semibold">Automated Service Aggregator</p>
              <p className="text-xs text-indigo-700 mt-0.5">
                Automatically consolidates doctor consultation fees, diagnostic laboratory orders,
                and prescribed medications from completed encounters into a single itemized billing
                invoice.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {encounters.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  No clinical encounters available.
                </div>
              ) : (
                encounters.map((enc) => (
                  <div
                    key={enc._id}
                    className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 font-mono text-sm">
                          Encounter #{enc._id.slice(-6)}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                          {enc.type || 'General'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          {enc.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Patient: {enc.patientId} | Doctor: {enc.doctorId} | Date:{' '}
                        {new Date(enc.startTime || enc.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <button
                      onClick={() => handleGenerateFromEncounter(enc._id)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                    >
                      Aggregate Invoice <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TPA Insurance Claims */}
      {activeTab === 'tpa' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">TPA Provider</th>
                  <th className="py-3 px-4">Policy Number</th>
                  <th className="py-3 px-4">Claim Amount</th>
                  <th className="py-3 px-4">Claim Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No insurance TPA claims associated with current invoices.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv._id} className="hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono font-semibold">{inv.invoiceNumber}</td>
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {inv.tpaClaim?.providerName || 'N/A'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{inv.tpaClaim?.policyNumber}</td>
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        ${inv.tpaClaim?.claimAmount?.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                          {inv.tpaClaim?.claimStatus || 'SUBMITTED'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenPayment(inv)}
                          className="px-2.5 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                        >
                          Record Settlement
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                Record Payment for {selectedInvoice.invoiceNumber}
              </h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="space-y-4 text-sm">
              <div className="bg-gray-50 p-3 rounded-lg flex justify-between font-medium">
                <span>Balance Due:</span>
                <span className="text-red-600 font-bold font-mono">
                  ${selectedInvoice.balanceDue?.toFixed(2)}
                </span>
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={paymentData.paymentMethod}
                  onChange={(e) =>
                    setPaymentData({ ...paymentData, paymentMethod: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="CASH">Cash at Counter</option>
                  <option value="STRIPE">Stripe Card / Online</option>
                  <option value="RAZORPAY">Razorpay / UPI</option>
                  <option value="INSURANCE_TPA">Insurance / TPA Claim</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Payment Amount ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={paymentData.amount}
                  onChange={(e) =>
                    setPaymentData({ ...paymentData, amount: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">
                  Transaction Reference
                </label>
                <input
                  type="text"
                  value={paymentData.transactionReference}
                  onChange={(e) =>
                    setPaymentData({ ...paymentData, transactionReference: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {showDetailModal && activeInvoiceDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">
                  Invoice {activeInvoiceDetail.invoiceNumber}
                </h3>
                <p className="text-xs text-gray-500">
                  Issued on {new Date(activeInvoiceDetail.issuedAt).toLocaleDateString()} | Patient:{' '}
                  {activeInvoiceDetail.patientId}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
              >
                ×
              </button>
            </div>

            {/* Line items table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 font-semibold border-b">
                  <tr>
                    <th className="py-2 px-3">Service / Item</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Qty</th>
                    <th className="py-2 px-3">Price</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeInvoiceDetail.lineItems?.map((it: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-medium text-gray-900">{it.description}</td>
                      <td className="py-2 px-3 text-gray-500">{it.itemType}</td>
                      <td className="py-2 px-3">{it.quantity}</td>
                      <td className="py-2 px-3">${it.unitPrice?.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-semibold">
                        ${it.amount?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-1 text-sm font-medium">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span>${activeInvoiceDetail.subtotal?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax (5%):</span>
                <span>${activeInvoiceDetail.taxAmount?.toFixed(2)}</span>
              </div>
              {activeInvoiceDetail.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span>-${activeInvoiceDetail.discountAmount?.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base text-gray-900 pt-1 border-t">
                <span>Total Amount:</span>
                <span>${activeInvoiceDetail.totalAmount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Paid Amount:</span>
                <span>${activeInvoiceDetail.paidAmount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-red-600 font-bold">
                <span>Balance Due:</span>
                <span>${activeInvoiceDetail.balanceDue?.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment history */}
            {paymentHistory.length > 0 && (
              <div className="pt-2">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Payment History
                </h4>
                <div className="space-y-1.5">
                  {paymentHistory.map((tx) => (
                    <div
                      key={tx._id}
                      className="text-xs p-2 bg-gray-50 rounded border flex justify-between items-center"
                    >
                      <div>
                        <span className="font-semibold">{tx.paymentMethod}</span> — Ref:{' '}
                        <span className="font-mono">{tx.transactionReference}</span>
                        <p className="text-gray-400 text-[10px]">
                          {new Date(tx.recordedAt).toLocaleString()} by {tx.recordedBy}
                        </p>
                      </div>
                      <span className="font-bold text-emerald-700">${tx.amount?.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-right pt-2 border-t">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Create Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900">Create New Invoice</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleManualCreateInvoice} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Patient Profile ID *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter patient profile ID..."
                  value={newInvoiceData.patientId}
                  onChange={(e) =>
                    setNewInvoiceData({ ...newInvoiceData, patientId: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">
                  Line Item Description
                </label>
                <input
                  type="text"
                  value={newInvoiceData.items[0].description}
                  onChange={(e) => {
                    const items = [...newInvoiceData.items];
                    items[0].description = e.target.value;
                    setNewInvoiceData({ ...newInvoiceData, items });
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Unit Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newInvoiceData.items[0].unitPrice}
                    onChange={(e) => {
                      const items = [...newInvoiceData.items];
                      items[0].unitPrice = Number(e.target.value);
                      setNewInvoiceData({ ...newInvoiceData, items });
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Discount ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={newInvoiceData.discountAmount}
                    onChange={(e) =>
                      setNewInvoiceData({
                        ...newInvoiceData,
                        discountAmount: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPage;
