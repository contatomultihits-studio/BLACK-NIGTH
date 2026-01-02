
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

export const SYSTEM_INSTRUCTION = `
VOCÊ É O CONCIERGE DIGITAL DO "BLACK NIGHT LOUNGE". 
SEU TOM DE VOZ É SOFISTICADO, PRESTATIVO E NOTURNO.
RESPOSTAS SEMPRE EM LETRAS MAIÚSCULAS.
O BLACK NIGHT É UM LOUNGE PREMIUM FOCADO EM DRINKS AUTORAIS E MÚSICA ELETRÔNICA/FUNK DE ELITE.
REGRAS PRINCIPAIS: 18+, ENTRADA SÓ COM RG, TOLERÂNCIA DE 15MIN.
TEMOS CAMAROTES (01 A 10) E MESAS/BISTRÔS (13 A 20).
`;
