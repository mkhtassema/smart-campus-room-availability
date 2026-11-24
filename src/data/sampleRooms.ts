import type { Room } from '@/types';

export const SAMPLE_ROOMS: Room[] = [
  {
    id: 'r1',
    name: 'Engineering 101',
    building: 'Founders Hall',
    capacity: 40,
    blocked: false,
    bookings: [
      { start: 540, end: 600, label: 'CS 201 Lecture' },
      { start: 720, end: 780, label: 'Faculty Meeting' },
    ],
  },
  {
    id: 'r2',
    name: 'Science Lab 3B',
    building: 'Curie Wing',
    capacity: 24,
    blocked: true,
    blockReason: 'Maintenance — HVAC repair scheduled',
    bookings: [
      { start: 600, end: 660, label: 'Chem 110 Lab' },
    ],
  },
  {
    id: 'r3',
    name: 'Library Study Room A',
    building: 'Central Library',
    capacity: 8,
    blocked: false,
    bookings: [
      { start: 480, end: 510, label: 'Group Study' },
      { start: 900, end: 960, label: 'Book Club' },
    ],
  },
  {
    id: 'r4',
    name: 'Auditorium C',
    building: 'Arts Center',
    capacity: 120,
    blocked: false,
    bookings: [
      { start: 840, end: 960, label: 'Guest Lecture' },
    ],
  },
];
