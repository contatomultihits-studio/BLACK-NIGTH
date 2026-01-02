
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
  status: 'available' | 'reserved' | 'blocked';
  price: number;
  customer?: {
    fullName: string;
    birthDate: string;
    cpf: string;
    phone: string;
    guests: string[];
    timestamp: number;
    receipt?: string; // Base64 string of the uploaded receipt
    age: string;
  };
}

export interface PriceConfig {
  [id: string]: number; // key format: "Day|Type|Number"
}
