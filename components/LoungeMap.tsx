
import React from 'react';
import { CAMAROTES_LEFT, CAMAROTES_RIGHT, CAMAROTES_BOTTOM, MESAS_CENTER } from '../constants';
import { Reservation, ReservationType } from '../types';

interface MapProps {
  reservations: Reservation[];
  onSelect: (id: string) => void;
  selectedId: string | null;
  day: string;
  prices: Record<string, number>;
}

const LoungeMap: React.FC<MapProps> = ({ reservations, onSelect, selectedId, day, prices }) => {
  const getStatus = (type: ReservationType, num: string) => {
    const res = reservations.find(r => r.day === day && r.type === type && r.number === num);
    if (!res) return 'available';
    
    // Verificação de expiração para status 'pending'
    if (res.status === 'pending') {
      const now = Date.now();
      if (res.expires_at && res.expires_at < now) return 'available';
      return 'pending'; 
    }
    
    return res.status;
  };

  const MapItem = ({ type, num, className = "" }: { type: ReservationType, num: string, className?: string }) => {
    const status = getStatus(type, num);
    const id = `${day}|${type}|${num}`;
    const isSelected = selectedId === id;
    const price = prices[id] || (type === ReservationType.VIP_BOOTH ? 1500 : 400);

    // Identifica se o local está ocupado de qualquer forma (Reserva, Pendente ou Bloqueio ADM)
    const isOccupied = status === 'reserved' || status === 'pending' || status === 'blocked';

    let styles = 'bg-[#0f0f0f] border-zinc-800 hover:border-gold-500/50 cursor-pointer shadow-lg';
    let label = 'R$ ' + Math.round(price);
    let isDisabled = false;

    if (isOccupied) {
      // APLICAÇÃO DO VERMELHO PARA BLOQUEADOS (SOLICITAÇÃO DO USUÁRIO)
      styles = 'bg-red-950/40 border-red-600/60 cursor-not-allowed opacity-90 shadow-[0_0_20px_rgba(220,38,38,0.3)]';
      label = status === 'blocked' ? 'RESERVADO ADM' : (status === 'pending' ? 'EM PROCESSO' : 'OCUPADO');
      isDisabled = true;
    }

    if (isSelected) {
      styles = 'bg-gold-500/10 border-gold-500 ring-4 ring-gold-500/30 scale-[1.08] z-10 shadow-[0_0_40px_rgba(212,175,55,0.3)]';
    }

    return (
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => onSelect(id)}
        className={`relative flex flex-col items-center justify-center transition-all duration-700 border-2 rounded-[2rem] p-4 ${styles} ${className}`}
      >
        <span className="text-[8px] uppercase font-black opacity-40 mb-2 tracking-[0.3em]">{type === ReservationType.VIP_BOOTH ? 'CAMAROTE' : 'BISTRÔ'}</span>
        <span className="text-3xl font-black text-white leading-none tracking-tighter">{num}</span>
        <span className={`text-[10px] font-black mt-3 tracking-widest ${status === 'available' ? 'text-gold-500' : 'text-zinc-400'}`}>{label}</span>
      </button>
    );
  };

  return (
    <div className="w-full bg-white/5 p-12 rounded-[5rem] border border-white/5 space-y-12 animate-fade-in uppercase">
      {/* HEADER: PALCO */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-3 bg-red-950/10 border-2 border-red-900/10 flex flex-col items-center justify-center rounded-[2.5rem] h-36 opacity-30 select-none">
          <i className="fas fa-lock-open text-red-900 text-xl mb-2"></i>
          <span className="text-[8px] font-black text-red-900 tracking-[0.4em]">ACESSO</span>
        </div>
        <div className="col-span-6 bg-zinc-900/40 border-2 border-zinc-800 flex flex-col items-center justify-center rounded-[2.5rem] h-36 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-1 bg-gold-500/20"></div>
           <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse mb-3 shadow-[0_0_20px_red]"></div>
           <span className="text-4xl font-serif gold-text font-black tracking-[0.8em] ml-4">PALCO</span>
        </div>
        <div className="col-span-3">
          <MapItem type={ReservationType.VIP_BOOTH} num="10" className="h-36" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-10">
        {/* LADO ESQUERDO */}
        <div className="col-span-3 space-y-6">
          <MapItem type={ReservationType.VIP_BOOTH} num="01" className="h-32" />
          <MapItem type={ReservationType.VIP_BOOTH} num="02" className="h-32" />
          <div className="flex flex-col items-center justify-center h-24 opacity-10">
             <i className="fas fa-arrow-down text-2xl"></i>
          </div>
          <MapItem type={ReservationType.VIP_BOOTH} num="03" className="h-32" />
        </div>

        {/* CENTRO: MESAS */}
        <div className="col-span-6">
          <div className="grid grid-cols-2 gap-6">
            {MESAS_CENTER.map((pair, idx) => (
              <React.Fragment key={idx}>
                <MapItem type={ReservationType.TABLE_BISTRO} num={pair[0]} className="h-32" />
                <MapItem type={ReservationType.TABLE_BISTRO} num={pair[1]} className="h-32" />
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* LADO DIREITO */}
        <div className="col-span-3 space-y-6">
          <MapItem type={ReservationType.VIP_BOOTH} num="09" className="h-40" />
          <MapItem type={ReservationType.VIP_BOOTH} num="08" className="h-40" />
          <MapItem type={ReservationType.VIP_BOOTH} num="07" className="h-40" />
        </div>
      </div>

      {/* RODAPÉ: CAMAROTES INFERIORES */}
      <div className="grid grid-cols-3 gap-6 pt-6">
        <MapItem type={ReservationType.VIP_BOOTH} num="04" className="h-36" />
        <MapItem type={ReservationType.VIP_BOOTH} num="05" className="h-36" />
        <MapItem type={ReservationType.VIP_BOOTH} num="06" className="h-36" />
      </div>

      <div className="flex justify-center flex-wrap gap-12 text-[9px] font-black pt-12 border-t border-white/5 opacity-50 tracking-[0.4em] uppercase">
        <div className="flex items-center gap-3"><div className="w-3 h-3 bg-zinc-800 rounded-full border border-white/10"></div> DISPONÍVEL</div>
        <div className="flex items-center gap-3"><div className="w-3 h-3 bg-red-600 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.4)]"></div> OCUPADO / BLOQUEADO</div>
        <div className="flex items-center gap-3"><div className="w-3 h-3 bg-gold-500 rounded-full shadow-[0_0_15px_gold]"></div> SELECIONADO</div>
      </div>
    </div>
  );
};

export default LoungeMap;
