import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  PlusCircle,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  ShieldAlert,
} from 'lucide-react';
import {
  fetchDoctors,
  fetchAvailability,
  createAvailability,
  fetchAvailableSlots,
  fetchAppointments,
  createAppointment,
  updateAppointmentStatus,
} from '../services/api';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const AppointmentsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'appointments' | 'book' | 'schedules' | 'slots' | 'configure'
  >('appointments');
  const [doctors, setDoctors] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Booking Form State
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [bookingDate, setBookingDate] = useState<string>(
    new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow default
  );
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [patientId, setPatientId] = useState<string>('');
  const [bookingReason, setBookingReason] = useState<string>('');
  const [isEmergency, setIsEmergency] = useState<boolean>(false);
  const [bookingLoading, setBookingLoading] = useState<boolean>(false);

  // Availability Schedule Form State
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
      const [docs, scheds, appts] = await Promise.all([
        fetchDoctors(),
        fetchAvailability(),
        fetchAppointments(),
      ]);
      setDoctors(docs);
      setSchedules(scheds);
      setAppointments(appts);
      if (docs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(docs[0]._id);
        setScheduleForm((prev) => ({ ...prev, doctorId: docs[0]._id }));
      }
    } catch (err: any) {
      setError(err.message || 'Error loading appointments data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch slots whenever doctor or date changes in booking tab or slots tab
  const handleLoadSlots = async (docId: string, date: string) => {
    if (!docId || !date) return;
    try {
      const res = await fetchAvailableSlots(docId, date);
      setAvailableSlots(res.slots || []);
      setSelectedSlot(null);
    } catch (err: any) {
      setAvailableSlots([]);
    }
  };

  useEffect(() => {
    if (selectedDoctorId && bookingDate) {
      handleLoadSlots(selectedDoctorId, bookingDate);
    }
  }, [selectedDoctorId, bookingDate]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot && !isEmergency) {
      setError('Please select an available appointment time slot.');
      return;
    }

    setBookingLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let startTimeDate: Date;
      let endTimeDate: Date;

      if (isEmergency) {
        // Immediate start
        startTimeDate = new Date();
        endTimeDate = new Date(startTimeDate.getTime() + 30 * 60 * 1000);
      } else {
        startTimeDate = new Date(`${bookingDate}T${selectedSlot.startTime}:00`);
        endTimeDate = new Date(`${bookingDate}T${selectedSlot.endTime}:00`);
      }

      const res = await createAppointment({
        doctorId: selectedDoctorId,
        patientId,
        startTime: startTimeDate.toISOString(),
        endTime: endTimeDate.toISOString(),
        type: isEmergency ? 'EMERGENCY' : 'ROUTINE',
        isEmergency,
        reason: bookingReason,
      });

      setSuccess(`Appointment booked successfully! ID: ${res._id}`);
      setBookingReason('');
      setSelectedSlot(null);
      loadData();
      setActiveTab('appointments');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleStatusChange = async (appointmentId: string, status: string) => {
    try {
      await updateAppointmentStatus(appointmentId, status);
      setSuccess(`Appointment status transitioned to ${status}`);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

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
      setSuccess('Doctor weekly availability schedule created successfully!');
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
            Appointments & Consultation Scheduling
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Book consultations, prevent concurrent double-booking, manage doctor weekly availability
            and status workflows.
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
          { id: 'appointments', label: 'Consultations Queue', icon: BookOpen },
          { id: 'book', label: 'Book Appointment', icon: PlusCircle },
          { id: 'schedules', label: 'Doctor Availability', icon: CalendarIcon },
          { id: 'slots', label: 'Slots Inspector', icon: Clock },
          { id: 'configure', label: 'Add Shift Template', icon: PlusCircle },
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

      {/* Tab 1: Consultations Queue */}
      {activeTab === 'appointments' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-base font-semibold text-slate-900">Scheduled Appointments</h3>
              <span className="text-xs text-slate-500 font-mono">Total: {appointments.length}</span>
            </div>
            {appointments.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <BookOpen className="h-10 w-10 mx-auto text-slate-400 mb-2" />
                <p className="font-medium">No appointments booked yet</p>
                <p className="text-xs mt-1">
                  Use the Book Appointment tab to schedule a patient consultation.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium">Patient</th>
                      <th className="px-6 py-3 text-left font-medium">Doctor</th>
                      <th className="px-6 py-3 text-left font-medium">Date & Time</th>
                      <th className="px-6 py-3 text-left font-medium">Type</th>
                      <th className="px-6 py-3 text-left font-medium">Status</th>
                      <th className="px-6 py-3 text-right font-medium">Lifecycle Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {appointments.map((appt) => (
                      <tr key={appt._id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {appt.patientId?.firstName} {appt.patientId?.lastName}
                          <span className="block text-xs text-slate-500 font-mono">
                            MRN: {appt.patientId?.mrn}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          Dr. {appt.doctorId?.userId?.firstName} {appt.doctorId?.userId?.lastName}
                          <span className="block text-xs text-slate-500">
                            {appt.doctorId?.specialization}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                          {new Date(appt.startTime).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          {appt.isEmergency || appt.type === 'EMERGENCY' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800">
                              <ShieldAlert className="h-3 w-3 mr-1" /> EMERGENCY
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600 font-medium">{appt.type}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              appt.status === 'CONFIRMED'
                                ? 'bg-blue-100 text-blue-800'
                                : appt.status === 'IN_PROGRESS'
                                  ? 'bg-amber-100 text-amber-800'
                                  : appt.status === 'COMPLETED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : appt.status === 'CANCELLED'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {appt.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-1.5">
                          {appt.status === 'CONFIRMED' && (
                            <button
                              onClick={() => handleStatusChange(appt._id, 'IN_PROGRESS')}
                              className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-2 py-1 rounded font-medium border border-amber-200"
                            >
                              Start
                            </button>
                          )}
                          {appt.status === 'IN_PROGRESS' && (
                            <button
                              onClick={() => handleStatusChange(appt._id, 'COMPLETED')}
                              className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2 py-1 rounded font-medium border border-emerald-200"
                            >
                              Complete
                            </button>
                          )}
                          {appt.status !== 'COMPLETED' && appt.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleStatusChange(appt._id, 'CANCELLED')}
                              className="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 px-2 py-1 rounded font-medium border border-rose-200"
                            >
                              Cancel
                            </button>
                          )}
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

      {/* Tab 2: Book Appointment Engine */}
      {activeTab === 'book' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm max-w-3xl">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <PlusCircle className="h-5 w-5 mr-2 text-teal-600" />
            Book Patient Consultation
          </h2>
          <form onSubmit={handleBookingSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Select Doctor *
                </label>
                <select
                  required
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Select Doctor</option>
                  {doctors.map((d) => (
                    <option key={d._id} value={d._id}>
                      Dr. {d.userId?.firstName} {d.userId?.lastName} ({d.specialization})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Appointment Date *
                </label>
                <input
                  type="date"
                  required
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Patient ID *</label>
              <input
                type="text"
                required
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="PatientProfile ObjectId"
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Consultation Reason
              </label>
              <textarea
                rows={2}
                value={bookingReason}
                onChange={(e) => setBookingReason(e.target.value)}
                placeholder="Chief complaints, symptoms or follow-up details..."
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="emergencyToggle"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
                className="h-4 w-4 text-rose-600 rounded border-slate-300"
              />
              <label
                htmlFor="emergencyToggle"
                className="text-xs font-semibold text-rose-700 flex items-center"
              >
                <ShieldAlert className="h-4 w-4 mr-1 text-rose-600" />
                Emergency Appointment (Bypasses standard working shift schedule)
              </label>
            </div>

            {/* Time Slots Chips Selection */}
            {!isEmergency && (
              <div className="border-t border-slate-200 pt-4">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Select Available Time Slot *
                </label>
                {availableSlots.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    No open availability slots for this doctor on the selected date. Choose another
                    date or doctor.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {availableSlots.map((slot, idx) => (
                      <button
                        type="button"
                        key={idx}
                        disabled={slot.isBooked}
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-2.5 rounded-md text-xs font-mono font-semibold border transition-all text-center ${
                          slot.isBooked
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                            : selectedSlot?.startTime === slot.startTime
                              ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                              : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                        }`}
                      >
                        {slot.startTime} – {slot.endTime}
                        <span className="block text-[10px] font-sans font-normal">
                          {slot.isBooked
                            ? 'Booked'
                            : selectedSlot?.startTime === slot.startTime
                              ? 'Selected'
                              : 'Open'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={bookingLoading}
              className="mt-4 px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-md hover:bg-teal-700 disabled:opacity-50 shadow-sm"
            >
              {bookingLoading ? 'Confirming Booking...' : 'Confirm Appointment Booking'}
            </button>
          </form>
        </div>
      )}

      {/* Tab 3: Schedules Tab */}
      {activeTab === 'schedules' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Doctor Weekly Availability Registry
            </h3>
          </div>
          {schedules.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <CalendarIcon className="h-10 w-10 mx-auto text-slate-400 mb-2" />
              <p>No availability schedules registered yet.</p>
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
      )}

      {/* Tab 4: Slots Tab */}
      {activeTab === 'slots' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Select Doctor</label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
              >
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>
                    Dr. {d.userId?.firstName} {d.userId?.lastName} ({d.specialization})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-3">
            {availableSlots.map((slot, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border text-center font-mono text-xs font-semibold ${
                  slot.isBooked
                    ? 'bg-slate-100 text-slate-400 border-slate-200'
                    : 'bg-teal-50 text-teal-800 border-teal-200'
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
        </div>
      )}

      {/* Tab 5: Configure Tab */}
      {activeTab === 'configure' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <PlusCircle className="h-5 w-5 mr-2 text-teal-600" />
            Add Shift Template
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
                  Slot Duration *
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

            <button
              type="submit"
              className="mt-4 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 shadow-sm"
            >
              Save Schedule Template
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
