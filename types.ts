
export type ReservationDay = 'Sexta' | 'Sábado';

export enum ReservationType {
  VIP_BOOTH = 'Camarote',
  TABLE_BISTRO = 'Mesa/Bistrô'
}

export interface Reservation {
  id: string; 
  day: ReservationDay;
  type: ReservationType;
  number: string;
  status: 'available' | 'reserved' | 'blocked' | 'pending';
  price: number;
  expires_at?: number; // Timestamp para expiração do bloqueio temporário
  customer?: {
    fullName: string;
    birthDate: string;
    cpf: string;
    phone: string;
    guests: string[];
    timestamp: number;
    receipt?: string;
    age: string;
  };
}

export interface PriceConfig {
  [id: string]: number;
}
