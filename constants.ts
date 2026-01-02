
export const CAMAROTES_LEFT = ["01", "02", "03"];
export const CAMAROTES_RIGHT = ["10", "09", "08", "07"];
export const CAMAROTES_BOTTOM = ["04", "05", "06"];
export const MESAS_CENTER = [
  ["20", "19"],
  ["18", "17"],
  ["16", "15"],
  ["14", "13"]
];

export const DEFAULT_PRICES: Record<string, number> = {
  'Camarote': 1500,
  'Mesa/Bistrô': 400
};

export const PIX_KEY = "34293016000151";

export const HOUSE_POLICIES = {
  'Sexta': {
    open: '23H00',
    limit: '23H30',
    description: 'SEXTA-FEIRA E VÉSPERAS DE FERIADO'
  },
  'Sábado': {
    open: '23H30',
    limit: '00H30',
    description: 'SÁBADO PREMIUM'
  }
};

export const PROHIBITED_ITEMS = [
  { icon: 'fa-user-slash', text: 'MENORES DE 18 ANOS' },
  { icon: 'fa-shoe-prints', text: 'CHINELO / RASTEIRINHA' },
  { icon: 'fa-mitten', text: 'CAPUZ OU TOUCA' },
  { icon: 'fa-tshirt', text: 'CAMISETA DE TIME / REGATA' },
  { icon: 'fa-hat-cowboy', text: 'BONÉ DE TIME' },
  { icon: 'fa-vest', text: 'CORTA-VENTO / TACTEL' },
  { icon: 'fa-link-slash', text: 'CORRENTES GROSSAS' }
];

// Added missing SYSTEM_INSTRUCTION constant for Gemini Concierge
export const SYSTEM_INSTRUCTION = "Você é o concierge virtual da Black Night, um lounge de luxo exclusivo. Seu tom é sofisticado, extremamente educado e prestativo. Você ajuda os clientes com informações sobre o mapa de mesas e camarotes, valores, trajes permitidos e horários de funcionamento. Mantenha as respostas concisas e elegantes.";
