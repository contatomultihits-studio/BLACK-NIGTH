
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
    return res?.status || 'available';
  };

  const MapItem = ({ type, num, className = "" }: { type: ReservationType, num: string, className?: string }) => {
    const status = getStatus(type, num);
    const id = `${day}|${type}|${num}`;
    const isSelected = selectedId === id;
    const price = prices[id] || (type === ReservationType.VIP_BOOTH ? 1500 : 400);

    let styles = 'bg-[#0f0f0f] border-zinc-800 hover:border-gold-500/50 cursor-pointer';
    if (status === 'reserved') styles = 'bg-red-950/40 border-red-900/50 cursor-not-allowed';
    if (status === 'blocked') styles = 'bg-zinc-900 border-zinc-950 opacity-50 cursor-not-allowed';
    if (isSelected) styles = 'bg-gold-500/10 border-gold-500 ring-2 ring-gold-500/50 scale-[1.02] z-10';

    return (
      <button
        type="button"
        disabled={status !== 'available'}
        onClick={() => onSelect(id)}
        className={`relative flex flex-col items-center justify-center transition-all duration-500 border-2 rounded-2xl p-2 ${styles} ${className}`}
      >
        <span className="text-[8px] uppercase font-black opacity-30 mb-1 tracking-widest">{type === ReservationType.VIP_BOOTH ? 'VIP' : 'MESA'}</span>
        <span className="text-xl font-black text-white leading-none">{num}</span>
        {status === 'available' && (
          <span className="text-[9px] font-black text-gold-500 mt-2">R$ {Math.round(price)}</span>
        )}
        {status === 'reserved' && (
          <span className="text-[8px] font-black text-red-500 mt-2">OCUPADO</span>
        )}
      </button>
    );
  };

  return (
    <div className="w-full bg-white/5 p-8 rounded-[3rem] border border-white/5 space-y-6 animate-fade-in uppercase">
      {/* HEADER: PALCO */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3 bg-red-950/20 border border-red-900/20 flex flex-col items-center justify-center rounded-2xl h-28">
          <i className="fas fa-door-closed text-red-900 mb-1"></i>
          <span className="text-[8px] font-black text-red-900 tracking-widest">PRIVATE</span>
        </div>
        <div className="col-span-6 bg-zinc-900/50 border border-zinc-800 flex flex-col items-center justify-center rounded-2xl h-28">
           <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse mb-2"></div>
           <span className="text-xl font-serif gold-text font-black tracking-[0.4em]">PALCO</span>
        </div>
        <div className="col-span-3">
          <MapItem type={ReservationType.VIP_BOOTH} num="10" className="h-28" />
        </div>
      </div>

      {/* MID SECTION */}
      <div className="grid grid-cols-12 gap-6">
        {/* LEFT COLUMN */}
        <div className="col-span-3 space-y-4">
          <MapItem type={ReservationType.VIP_BOOTH} num="01" className="h-24" />
          <MapItem type={ReservationType.VIP_BOOTH} num="02" className="h-24" />
          <div className="flex flex-col items-center justify-center h-20 opacity-10">
             <i className="fas fa-chevron-left text-2xl mb-1"></i>
             <span className="text-[8px] font-black">CORREDOR</span>
          </div>
          <MapItem type={ReservationType.VIP_BOOTH} num="03" className="h-24" />
        </div>

        {/* CENTER COLUMN (MESAS) */}
        <div className="col-span-6">
          <div className="grid grid-cols-2 gap-4">
            {MESAS_CENTER.map((pair, idx) => (
              <React.Fragment key={idx}>
                <MapItem type={ReservationType.TABLE_BISTRO} num={pair[0]} className="h-24 shadow-xl" />
                <MapItem type={ReservationType.TABLE_BISTRO} num={pair[1]} className="h-24 shadow-xl" />
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-span-3 space-y-4">
          <MapItem type={ReservationType.VIP_BOOTH} num="09" className="h-32" />
          <MapItem type={ReservationType.VIP_BOOTH} num="08" className="h-32" />
          <MapItem type={ReservationType.VIP_BOOTH} num="07" className="h-32" />
        </div>
      </div>

      {/* BOTTOM ROW */}
      <div className="grid grid-cols-3 gap-4">
        <MapItem type={ReservationType.VIP_BOOTH} num="04" className="h-28" />
        <MapItem type={ReservationType.VIP_BOOTH} num="05" className="h-28" />
        <MapItem type={ReservationType.VIP_BOOTH} num="06" className="h-28" />
      </div>

      {/* LEGEND */}
      <div className="flex justify-center flex-wrap gap-6 text-[9px] font-black pt-8 border-t border-white/5 opacity-60">
        <div className="flex items-center gap-3"><div className="w-2 h-2 bg-zinc-800 rounded-full"></div> LIVRE</div>
        <div className="flex items-center gap-3"><div className="w-2 h-2 bg-red-900 rounded-full"></div> RESERVADO</div>
        <div className="flex items-center gap-3"><div className="w-2 h-2 bg-gold-500 rounded-full"></div> SELECIONADO</div>
      </div>
    </div>
  );
};

export default LoungeMap;
