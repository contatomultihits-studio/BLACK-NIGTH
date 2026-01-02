
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

    let bgColor = 'bg-[#1a1a1a] border-zinc-800 hover:border-yellow-500';
    if (status === 'reserved' || status === 'blocked') bgColor = 'bg-red-900/40 border-red-800 cursor-not-allowed';
    if (isSelected) bgColor = 'bg-yellow-500/20 border-yellow-500 ring-2 ring-yellow-500';

    return (
      <button
        type="button"
        disabled={status !== 'available'}
        onClick={() => onSelect(id)}
        className={`relative flex flex-col items-center justify-center transition-all border-2 rounded-lg p-2 ${bgColor} ${className}`}
      >
        <span className="text-[10px] uppercase font-black opacity-40 mb-1">{type === ReservationType.VIP_BOOTH ? 'CAM' : 'MESA'}</span>
        <span className="text-xl font-black text-white">{num}</span>
        <span className="text-[9px] font-bold text-yellow-500 mt-1">R$ {price}</span>
      </button>
    );
  };

  return (
    <div className="w-full bg-white/5 p-4 rounded-3xl border border-white/10 space-y-4 animate-fade-in uppercase">
      {/* HEADER: PALCO */}
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-3 bg-red-600/20 border border-red-600/50 flex items-center justify-center text-[10px] font-black text-red-500 rounded-lg h-24">
          STAFF
        </div>
        <div className="col-span-6 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl font-black tracking-[0.3em] rounded-lg text-white h-24">
          PALCO
        </div>
        <div className="col-span-3">
          <MapItem type={ReservationType.VIP_BOOTH} num="10" className="h-24" />
        </div>
      </div>

      {/* MID SECTION */}
      <div className="grid grid-cols-12 gap-4">
        {/* LEFT COLUMN */}
        <div className="col-span-3 space-y-3">
          <MapItem type={ReservationType.VIP_BOOTH} num="01" className="h-20" />
          <MapItem type={ReservationType.VIP_BOOTH} num="02" className="h-20" />
          <div className="flex items-center justify-center h-16 opacity-30">
             <i className="fas fa-angles-left text-xl"></i>
          </div>
          <MapItem type={ReservationType.VIP_BOOTH} num="03" className="h-20" />
        </div>

        {/* CENTER COLUMN (MESAS) */}
        <div className="col-span-6">
          <div className="grid grid-cols-2 gap-3">
            {MESAS_CENTER.map((pair, idx) => (
              <React.Fragment key={idx}>
                <MapItem type={ReservationType.TABLE_BISTRO} num={pair[0]} className="h-20" />
                <MapItem type={ReservationType.TABLE_BISTRO} num={pair[1]} className="h-20" />
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-span-3 space-y-3">
          <MapItem type={ReservationType.VIP_BOOTH} num="09" className="h-28" />
          <MapItem type={ReservationType.VIP_BOOTH} num="08" className="h-28" />
          <MapItem type={ReservationType.VIP_BOOTH} num="07" className="h-28" />
        </div>
      </div>

      {/* BOTTOM ROW */}
      <div className="grid grid-cols-3 gap-3">
        <MapItem type={ReservationType.VIP_BOOTH} num="04" className="h-24" />
        <MapItem type={ReservationType.VIP_BOOTH} num="05" className="h-24" />
        <MapItem type={ReservationType.VIP_BOOTH} num="06" className="h-24" />
      </div>

      {/* LEGEND */}
      <div className="flex justify-center flex-wrap gap-4 text-[10px] font-black pt-4 border-t border-white/5">
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-zinc-800 rounded-sm"></div> DISPONÍVEL</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-900/40 rounded-sm"></div> OCUPADO</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-500/50 rounded-sm"></div> SELECIONADO</div>
      </div>
    </div>
  );
};

export default LoungeMap;
