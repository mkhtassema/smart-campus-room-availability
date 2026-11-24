export interface Booking {
  start: number; // minutes from midnight (0–1440)
  end: number;
  label: string;
}

export interface Room {
  id: string;
  name: string;
  building: string;
  capacity: number;
  blocked: boolean;
  blockReason?: string;
  bookings: Booking[];
}

export interface ValidationResult {
  available: boolean;
  reasons: string[];
}
