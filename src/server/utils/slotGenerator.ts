import { ITimeSlot } from '../../shared/types/index.js';

export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function hasIntervalOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

export interface BookedInterval {
  startTime: string;
  endTime: string;
}

export function generateSlotsFromSchedule(
  startTime: string,
  endTime: string,
  slotDurationMinutes: number,
  bookedIntervals: BookedInterval[] = [],
): ITimeSlot[] {
  const slots: ITimeSlot[] = [];
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  let currentMin = startMin;
  while (currentMin + slotDurationMinutes <= endMin) {
    const slotStartStr = minutesToTime(currentMin);
    const slotEndStr = minutesToTime(currentMin + slotDurationMinutes);

    // Check if slot overlaps with any booked appointment
    const isBooked = bookedIntervals.some((b) =>
      hasIntervalOverlap(slotStartStr, slotEndStr, b.startTime, b.endTime),
    );

    slots.push({
      startTime: slotStartStr,
      endTime: slotEndStr,
      isBooked,
      slotDurationMinutes,
    });

    currentMin += slotDurationMinutes;
  }

  return slots;
}
