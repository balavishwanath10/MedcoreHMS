import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  PlusCircle,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  fetchDoctors,
  fetchAvailability,
  createAvailability,
  fetchAvailableSlots,
} from '../services/api';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const AppointmentsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'schedules' | 'slots' | 'configure'>('schedules');
  const [doctors, setDoctors] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Slot inspection state
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [generatedSlots, setGeneratedSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(false);

  // Availability Form State
  const [scheduleForm, setScheduleForm] = useState({
    doctorId: '',
    dayOfWeek: 1, // Monday default
    startTime: '09:00',
    endTime: '17:00',
    slotDurationMinutes: 30,
    isAvailable: true,
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [docs, scheds] = await Promise.all([fetchDoctors(), fetchAvailability()]);
      setDoctors(docs);
      setSchedules(scheds);
      if (docs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(docs[0]._id);
        setScheduleForm((prev) => ({ ...prev, doctorId: docs[0]._id }));
      }
    } catch (err: any) {
      setError(err.message || 'Error loading availability data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInspectSlots = async () => {
    if (!selectedDoctorId || !selectedDate) return;
    setSlotsLoading(true);
    setError(null);
    try {
      const data = await fetchAvailableSlots(selectedDoctorId, selectedDate);
      setGeneratedSlots(data.slots || []);
    } catch (err: any) {
      setError(err.message);
      setGeneratedSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDoctorId && selectedDate && activeTab === 'slots') {
      handleInspectSlots();
    }
  }, [selectedDoctorId, selectedDate, activeTab]);

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      if (scheduleForm.startTime >= scheduleForm.endTime) {
        throw new Error('End time must be later than start time.');
      }
      await createAvailability({
        doctorId: scheduleForm.doctorId,
        dayOfWeek: Number(scheduleForm.dayOfWeek),
        startTime: scheduleForm.startTime,
        endTime: scheduleForm.endTime,
        slotDurationMinutes: Number(scheduleForm.slotDurationMinutes),
        isAvailable: scheduleForm.isAvailable,
      });
      setSuccess('Doctor availability schedule created successfully!');
      loadData();
      setActiveTab('schedules');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Doctor Availability & Appointment Scheduling
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure weekly clinical shifts, time slots, and inspect available booking windows.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start space-x-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-rose-500" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start space-x-2">
          <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-emerald-500" />
          <span>{success}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 space-x-8">
        {[
          { id: 'schedules', label: 'Weekly Schedules', icon: CalendarIcon },
          { id: 'slots', label: 'Time Slots Inspector', icon: Clock },
          { id: 'configure', label: 'Configure Availability', icon: PlusCircle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Weekly Schedules */}
      {activeTab === 'schedules' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                Doctor Weekly Availability Registry
              </h3>
            </div>
            {schedules.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <CalendarIcon className="h-10 w-10 mx-auto text-slate-400 mb-2" />
                <p className="font-medium">No availability schedules registered yet</p>
                <p className="text-xs mt-1">
                  Configure weekly shifts using the Configure Availability tab.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium">Doctor</th>
                      <th className="px-6 py-3 text-left font-medium">Day of Week</th>
                      <th className="px-6 py-3 text-left font-medium">Shift Hours</th>
                      <th className="px-6 py-3 text-left font-medium">Slot Duration</th>
                      <th className="px-6 py-3 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {schedules.map((s) => (
                      <tr key={s._id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          Dr. {s.doctorId?.userId?.firstName} {s.doctorId?.userId?.lastName}
                          <span className="block text-xs text-slate-500 font-normal">
                            {s.doctorId?.specialization}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700 font-medium">
                          {DAYS_OF_WEEK[s.dayOfWeek]}
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-mono">
                          {s.startTime} – {s.endTime}
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-medium">
                          {s.slotDurationMinutes} mins
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              s.isAvailable
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {s.isAvailable ? 'Available' : 'Unavailable'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Available Slots Inspector */}
      {activeTab === 'slots' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Select Doctor</label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
              >
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>
                    Dr. {d.userId?.firstName} {d.userId?.lastName} ({d.specialization})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Appointment Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
              ></input>
            </div>

            <button
              onClick={handleInspectSlots}
              disabled={slotsLoading}
              className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 disabled:opacity-50"
            >
              {slotsLoading ? 'Generating...' : 'Inspect Slots'}
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center">
              <Clock className="h-4 w-4 mr-2 text-teal-600" />
              Available Time Slots for {selectedDate} (
              {DAYS_OF_WEEK[new Date(selectedDate).getDay()]})
            </h3>

            {generatedSlots.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Clock className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p>No available slots for this date or doctor is not scheduled.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {generatedSlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border text-center font-mono text-xs font-semibold ${
                      slot.isBooked
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100 cursor-pointer'
                    }`}
                  >
                    <div>
                      {slot.startTime} – {slot.endTime}
                    </div>
                    <span className="block text-[10px] font-sans mt-1 uppercase">
                      {slot.isBooked ? 'Booked' : 'Available'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Configure Availability */}
      {activeTab === 'configure' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <PlusCircle className="h-5 w-5 mr-2 text-teal-600" />
            Define Doctor Weekly Availability Schedule
          </h2>
          <form onSubmit={handleScheduleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Doctor *</label>
              <select
                required
                value={scheduleForm.doctorId}
                onChange={(e) => setScheduleForm({ ...scheduleForm, doctorId: e.target.value })}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
              >
                <option value="">Select Doctor</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>
                    Dr. {d.userId?.firstName} {d.userId?.lastName} ({d.specialization})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Day of Week *
                </label>
                <select
                  value={scheduleForm.dayOfWeek}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, dayOfWeek: Number(e.target.value) })
                  }
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
                >
                  {DAYS_OF_WEEK.map((day, idx) => (
                    <option key={idx} value={idx}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Slot Duration (Minutes) *
                </label>
                <select
                  value={scheduleForm.slotDurationMinutes}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      slotDurationMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={20}>20 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Start Time (HH:mm) *
                </label>
                <input
                  type="time"
                  required
                  value={scheduleForm.startTime}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  End Time (HH:mm) *
                </label>
                <input
                  type="time"
                  required
                  value={scheduleForm.endTime}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="isAvailable"
                checked={scheduleForm.isAvailable}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, isAvailable: e.target.checked })
                }
                className="h-4 w-4 text-teal-600 rounded border-slate-300"
              />
              <label htmlFor="isAvailable" className="text-xs font-medium text-slate-700">
                Mark as Active Shift (open for appointments)
              </label>
            </div>

            <button
              type="submit"
              className="mt-4 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 shadow-sm"
            >
              Save Weekly Schedule
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
