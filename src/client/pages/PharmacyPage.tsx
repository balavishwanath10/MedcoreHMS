import React, { useState, useEffect } from 'react';
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  ShieldAlert,
  Calendar,
  Box,
} from 'lucide-react';
import {
  fetchBatches,
  fetchExpiringBatches,
  addInventoryBatch,
  quarantineBatch,
  scanAndExpireBatches,
  dispensePrescription,
  fetchPrescriptions,
  searchMedicines,
} from '../services/api';

export const PharmacyPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'dispense' | 'expiry'>('inventory');
  const [batches, setBatches] = useState<any[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Add Batch Modal State
  const [showAddBatchModal, setShowAddBatchModal] = useState(false);
  const [newBatch, setNewBatch] = useState({
    medicineId: '',
    batchNumber: '',
    expiryDate: '',
    manufactureDate: '',
    quantityReceived: 100,
    unitCost: 5,
    mrp: 10,
    locationRack: 'Rack A-1',
    supplier: 'PharmaCorp Ltd',
  });

  // Quarantine Modal State
  const [showQuarantineModal, setShowQuarantineModal] = useState(false);
  const [quarantineTarget, setQuarantineTarget] = useState<any | null>(null);
  const [quarantineReason, setQuarantineReason] = useState('');

  // Dispensing State
  const [dispenseReceipt, setDispenseReceipt] = useState<any | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'inventory') {
        const data = await fetchBatches({ status: statusFilter || undefined });
        setBatches(data);
        const meds = await searchMedicines();
        setMedicines(meds);
      } else if (activeTab === 'dispense') {
        const rxList = await fetchPrescriptions();
        setPrescriptions(rxList.filter((p: any) => p.status === 'ISSUED'));
      } else if (activeTab === 'expiry') {
        const expiring = await fetchExpiringBatches(30);
        setExpiringBatches(expiring);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load pharmacy data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatch.medicineId || !newBatch.batchNumber || !newBatch.expiryDate) {
      setError('Please fill in all required batch fields.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await addInventoryBatch({
        ...newBatch,
        quantityReceived: Number(newBatch.quantityReceived),
        unitCost: Number(newBatch.unitCost),
        mrp: Number(newBatch.mrp),
      });
      setSuccessMsg(`Batch ${newBatch.batchNumber} received successfully!`);
      setShowAddBatchModal(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create inventory batch');
    } finally {
      setLoading(false);
    }
  };

  const handleQuarantine = async () => {
    if (!quarantineTarget || quarantineReason.trim().length < 3) {
      setError('A valid reason of at least 3 characters is required to quarantine.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await quarantineBatch(quarantineTarget._id, quarantineReason);
      setSuccessMsg(`Batch ${quarantineTarget.batchNumber} has been quarantined.`);
      setShowQuarantineModal(false);
      setQuarantineTarget(null);
      setQuarantineReason('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to quarantine batch');
    } finally {
      setLoading(false);
    }
  };

  const handleScanExpired = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await scanAndExpireBatches();
      setSuccessMsg(`Scan complete: ${res.expiredCount} batches marked as EXPIRED.`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to scan expired batches');
    } finally {
      setLoading(false);
    }
  };

  const handleDispense = async (rx: any) => {
    setLoading(true);
    setError(null);
    try {
      const receipt = await dispensePrescription(rx._id);
      setDispenseReceipt(receipt);
      setSuccessMsg(
        `Prescription for ${rx.patientId} dispensed successfully via FIFO! Total: $${receipt.grandTotal.toFixed(2)}`,
      );
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to dispense prescription');
    } finally {
      setLoading(false);
    }
  };

  const filteredBatches = batches.filter((b) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      b.medicineName?.toLowerCase().includes(term) ||
      b.batchNumber?.toLowerCase().includes(term) ||
      b.locationRack?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-7 h-7 text-emerald-600" />
            Pharmacy Inventory & FIFO Dispensing
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Track medicine batches, automate FIFO consumption, and monitor 30-day expiration alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'inventory' && (
            <button
              onClick={() => setShowAddBatchModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition"
            >
              <Plus className="w-4 h-4" />
              Receive New Batch
            </button>
          )}
          {activeTab === 'expiry' && (
            <button
              onClick={handleScanExpired}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition"
            >
              <RefreshCw className="w-4 h-4" />
              Scan & Expire Past Batches
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
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'inventory'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Box className="w-4 h-4" />
          Inventory Stock ({batches.length})
        </button>
        <button
          onClick={() => setActiveTab('dispense')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'dispense'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          FIFO Dispensing Queue ({prescriptions.length})
        </button>
        <button
          onClick={() => setActiveTab('expiry')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 transition border-b-2 ${
            activeTab === 'expiry'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          30-Day Expiry Alerts ({expiringBatches.length})
        </button>
      </div>

      {/* TAB 1: Inventory Stock Batches */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search by medicine name, batch number, rack..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="QUARANTINED">QUARANTINED</option>
              <option value="DEPLETED">DEPLETED</option>
            </select>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">Medicine Name</th>
                    <th className="py-3 px-4">Batch Number</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Stock (Avail / Recv)</th>
                    <th className="py-3 px-4">MRP / Unit Cost</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        No inventory batches found. Click "Receive New Batch" to add stock.
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((batch) => {
                      const isExpired = new Date(batch.expiryDate) <= new Date();
                      return (
                        <tr key={batch._id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {batch.medicineName || 'Medicine'}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">{batch.batchNumber}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 ${
                                isExpired ? 'text-red-600 font-semibold' : 'text-gray-600'
                              }`}
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(batch.expiryDate).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`font-semibold ${
                                batch.quantityAvailable === 0
                                  ? 'text-gray-400'
                                  : batch.quantityAvailable <= batch.reorderThreshold
                                    ? 'text-amber-600'
                                    : 'text-emerald-700'
                              }`}
                            >
                              {batch.quantityAvailable}
                            </span>{' '}
                            / {batch.quantityReceived}
                          </td>
                          <td className="py-3 px-4 font-mono">
                            ${batch.mrp?.toFixed(2)} / ${batch.unitCost?.toFixed(2)}
                          </td>
                          <td className="py-3 px-4">{batch.locationRack || 'General'}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                batch.status === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : batch.status === 'EXPIRED'
                                    ? 'bg-red-100 text-red-800'
                                    : batch.status === 'QUARANTINED'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {batch.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {batch.status === 'ACTIVE' && (
                              <button
                                onClick={() => {
                                  setQuarantineTarget(batch);
                                  setShowQuarantineModal(true);
                                }}
                                className="px-2.5 py-1 text-xs border border-amber-300 text-amber-700 bg-amber-50 rounded hover:bg-amber-100 transition"
                              >
                                Quarantine
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FIFO Dispensing Queue */}
      {activeTab === 'dispense' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-800">
                  Pending Prescriptions for Dispensing
                </h3>
                <p className="text-xs text-gray-500">
                  Batches are automatically allocated First-In-First-Out based on earliest
                  expiration date.
                </p>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {prescriptions.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  No pending prescriptions in the dispensing queue.
                </div>
              ) : (
                prescriptions.map((rx) => (
                  <div key={rx._id} className="p-6 flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">
                          Patient ID: {rx.patientId}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          {rx.status}
                        </span>
                        {rx.digitalSignature && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Signed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Prescribed on {new Date(rx.issuedAt || rx.createdAt).toLocaleDateString()}{' '}
                        by Doctor: {rx.doctorId}
                      </p>
                      {rx.diagnosis && (
                        <p className="text-xs text-gray-600">
                          <strong>Diagnosis:</strong> {rx.diagnosis}
                        </p>
                      )}
                      <div className="pt-2">
                        <span className="text-xs font-semibold text-gray-700">
                          Prescribed Items:
                        </span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {rx.items?.map((it: any, idx: number) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium"
                            >
                              {it.medicineName} — {it.dosage} ({it.frequency} × {it.durationDays}{' '}
                              days)
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-center">
                      <button
                        onClick={() => handleDispense(rx)}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition disabled:opacity-50"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Dispense (FIFO)
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Receipt Modal */}
          {dispenseReceipt && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Dispensing Receipt (FIFO Complete)
                  </h3>
                  <button
                    onClick={() => setDispenseReceipt(null)}
                    className="text-gray-400 hover:text-gray-600 font-bold"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-gray-500">
                    Prescription ID:{' '}
                    <span className="font-mono">{dispenseReceipt.prescriptionId}</span>
                  </p>
                  <div className="divide-y divide-gray-100 border rounded-lg p-3">
                    {dispenseReceipt.items.map((it: any, idx: number) => (
                      <div key={idx} className="py-2 first:pt-0 last:pb-0">
                        <div className="flex justify-between font-medium">
                          <span>{it.medicineName}</span>
                          <span>${it.totalItemPrice?.toFixed(2)}</span>
                        </div>
                        <p className="text-xs text-gray-500">Qty: {it.dispensedQuantity}</p>
                        <div className="mt-1 space-y-1">
                          {it.allocatedBatches?.map((b: any, bIdx: number) => (
                            <div
                              key={bIdx}
                              className="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-0.5 rounded flex justify-between"
                            >
                              <span>
                                Batch: {b.batchNumber} (Exp:{' '}
                                {new Date(b.expiryDate).toLocaleDateString()})
                              </span>
                              <span>Take: {b.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-base pt-2 border-t">
                    <span>Grand Total:</span>
                    <span className="text-emerald-700">
                      ${dispenseReceipt.grandTotal?.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="pt-2 text-right">
                  <button
                    onClick={() => setDispenseReceipt(null)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: 30-Day Expiry Alerts */}
      {activeTab === 'expiry' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">30-Day Expiration Monitoring</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Batches listed below will expire within the next 30 days. Prioritize dispensing them
                or quarantine them if past their expiration date.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Medicine</th>
                  <th className="py-3 px-4">Batch Number</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4">Days Left</th>
                  <th className="py-3 px-4">Quantity Available</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {expiringBatches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No active batches expiring within the next 30 days!
                    </td>
                  </tr>
                ) : (
                  expiringBatches.map((b) => {
                    const diffTime = new Date(b.expiryDate).getTime() - new Date().getTime();
                    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={b._id} className="hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-900">{b.medicineName}</td>
                        <td className="py-3 px-4 font-mono text-xs">{b.batchNumber}</td>
                        <td className="py-3 px-4 text-gray-600">
                          {new Date(b.expiryDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              daysLeft <= 0
                                ? 'bg-red-100 text-red-800'
                                : daysLeft <= 10
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} days`}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold">{b.quantityAvailable}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setQuarantineTarget(b);
                              setShowQuarantineModal(true);
                            }}
                            className="px-2.5 py-1 text-xs border border-amber-300 text-amber-700 bg-amber-50 rounded hover:bg-amber-100 transition"
                          >
                            Quarantine
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Batch Modal */}
      {showAddBatchModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900">Receive New Medicine Batch</h3>
              <button
                onClick={() => setShowAddBatchModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateBatch} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Select Medicine *</label>
                <select
                  value={newBatch.medicineId}
                  onChange={(e) => setNewBatch({ ...newBatch, medicineId: e.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">-- Choose Medicine from Formulary --</option>
                  {medicines.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} ({m.strength}) - {m.dosageForm}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Batch Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BATCH-2026-X1"
                    value={newBatch.batchNumber}
                    onChange={(e) => setNewBatch({ ...newBatch, batchNumber: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={newBatch.expiryDate}
                    onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">
                    Quantity Received *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newBatch.quantityReceived}
                    onChange={(e) =>
                      setNewBatch({ ...newBatch, quantityReceived: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newBatch.unitCost}
                    onChange={(e) => setNewBatch({ ...newBatch, unitCost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">MRP ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newBatch.mrp}
                    onChange={(e) => setNewBatch({ ...newBatch, mrp: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Location Rack</label>
                  <input
                    type="text"
                    value={newBatch.locationRack}
                    onChange={(e) => setNewBatch({ ...newBatch, locationRack: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={newBatch.supplier}
                    onChange={(e) => setNewBatch({ ...newBatch, supplier: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddBatchModal(false)}
                  className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  Save Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quarantine Modal */}
      {showQuarantineModal && quarantineTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                Quarantine Batch {quarantineTarget.batchNumber}
              </h3>
              <button
                onClick={() => setShowQuarantineModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Quarantining this batch immediately excludes it from FIFO dispensing. Please specify a
              mandatory reason (e.g. damaged seal, recall, temperature excursion).
            </p>
            <div>
              <label className="block font-medium text-gray-700 mb-1 text-sm">
                Quarantine Reason *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Enter clinical or regulatory reason..."
                value={quarantineReason}
                onChange={(e) => setQuarantineReason(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowQuarantineModal(false)}
                className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleQuarantine}
                disabled={loading}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 text-sm disabled:opacity-50"
              >
                Confirm Quarantine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PharmacyPage;
