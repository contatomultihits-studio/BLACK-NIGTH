
import React, { useState, useEffect } from 'react';
import { Reservation, ReservationDay, ReservationType } from './types';
import { HOUSE_POLICIES, PROHIBITED_ITEMS, PIX_KEY } from './constants';
import LoungeMap from './components/LoungeMap';
import ConciergeChat from './components/ConciergeChat';

const App: React.FC = () => {
  const [currentDay, setCurrentDay] = useState<ReservationDay | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Estados restaurados para localStorage
  const [reservations, setReservations] = useState<Reservation[]>(() => {
    const saved = localStorage.getItem('bn_reservations');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [prices, setPrices] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('bn_prices');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [flyers, setFlyers] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('bn_flyers');
    return saved ? JSON.parse(saved) : {};
  });

  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [selectedAdminRes, setSelectedAdminRes] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [isSystemOpen, setIsSystemOpen] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    birth: '',
    cpf: '',
    phone: '',
    guests: '',
    age: ''
  });

  // Salvar alterações no localStorage
  useEffect(() => {
    localStorage.setItem('bn_reservations', JSON.stringify(reservations));
  }, [reservations]);

  useEffect(() => {
    localStorage.setItem('bn_prices', JSON.stringify(prices));
  }, [prices]);

  useEffect(() => {
    localStorage.setItem('bn_flyers', JSON.stringify(flyers));
  }, [flyers]);

  // Trava de Horário (23h)
  useEffect(() => {
    const checkTimeLimit = () => {
      const now = new Date();
      const day = now.getDay(); 
      const hour = now.getHours();
      if ((day === 5 || day === 6) && hour >= 23) setIsSystemOpen(false);
      else setIsSystemOpen(true);
    };
    checkTimeLimit();
    const timer = setInterval(checkTimeLimit, 60000);
    return () => clearInterval(timer);
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSelectDay = (day: ReservationDay) => {
    setCurrentDay(day);
    setSelectedId(null);
  };

  const handleReservationClick = (id: string) => {
    const res = reservations.find(r => r.id === id);
    if (res?.status === 'blocked' && !isAdmin) return;
    setSelectedId(id);
    setShowForm(true);
  };

  const handleConfirmReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !currentDay) return;
    if (parseInt(formData.age) < 18) {
      alert("ACESSO NEGADO: APENAS PARA MAIORES DE 18 ANOS.");
      return;
    }
    setShowForm(false);
    setShowPayment(true);
  };

  const handlePaymentFinish = async () => {
    if (!selectedId || !currentDay) return;
    
    let receiptBase64 = '';
    if (receiptFile) {
      receiptBase64 = await fileToBase64(receiptFile);
    }

    const parts = selectedId.split('|');
    const type = parts[1];
    const num = parts[2];
    const finalPrice = prices[selectedId] || (type === ReservationType.VIP_BOOTH ? 1500 : 400);

    const newRes: Reservation = {
      id: selectedId,
      day: currentDay,
      type: type as ReservationType,
      number: num,
      status: 'reserved',
      price: finalPrice,
      customer: {
        fullName: formData.name.toUpperCase(),
        birthDate: formData.birth,
        cpf: formData.cpf,
        phone: formData.phone,
        guests: formData.guests.split('\n').filter(g => g.trim() !== '').map(g => g.toUpperCase()),
        timestamp: Date.now(),
        receipt: receiptBase64,
        age: formData.age
      }
    };

    setReservations(prev => [...prev.filter(r => r.id !== selectedId), newRes]);
    setShowPayment(false);
    setShowSuccess(true);
  };

  const handleFlyerUpload = async (day: ReservationDay, file: File) => {
    try {
      const base64 = await fileToBase64(file);
      setFlyers(prev => ({ ...prev, [day]: base64 }));
    } catch (e) {
      alert("ERRO AO CARREGAR FLYER.");
    }
  };

  const toggleBlockStatus = (id: string) => {
    const existing = reservations.find(r => r.id === id);
    if (existing) {
      if (existing.status === 'reserved') {
        if (!confirm("DESEJA CANCELAR A RESERVA E BLOQUEAR?")) return;
      }
      const newStatus = existing.status === 'blocked' ? 'available' : 'blocked';
      if (newStatus === 'available') {
        setReservations(prev => prev.filter(r => r.id !== id));
      } else {
        setReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'blocked' } : r));
      }
    } else {
      const parts = id.split('|');
      const day = parts[0] as ReservationDay;
      const type = parts[1] as ReservationType;
      const num = parts[2];
      const newBlock: Reservation = {
        id,
        day,
        type,
        number: num,
        status: 'blocked',
        price: prices[id] || (type === ReservationType.VIP_BOOTH ? 1500 : 400)
      };
      setReservations(prev => [...prev, newBlock]);
    }
  };

  const releaseReservation = (id: string) => {
    if (confirm("LIBERAR ESTE LOCAL?")) {
      setReservations(prev => prev.filter(r => r.id !== id));
    }
  };

  const updatePrice = (id: string, value: string) => {
    setPrices(prev => ({ ...prev, [id]: parseFloat(value) || 0 }));
  };

  const handleCopyPix = () => {
    navigator.clipboard.writeText(PIX_KEY);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const resetApp = () => {
    setShowSuccess(false);
    setShowForm(false);
    setShowPayment(false);
    setCurrentDay(null);
    setSelectedId(null);
    setReceiptFile(null);
    setFormData({ name: '', birth: '', cpf: '', phone: '', guests: '', age: '' });
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-center uppercase">
        <div className="glass-card max-w-md w-full p-10 rounded-[2.5rem] space-y-6 animate-fade-in">
          <div className="w-24 h-24 gold-gradient rounded-full flex items-center justify-center mx-auto ring-8 ring-zinc-900 shadow-2xl">
            <i className="fas fa-crown text-4xl text-black"></i>
          </div>
          <h1 className="text-4xl font-serif gold-text leading-tight font-black">RESERVA CONFIRMADA</h1>
          <div className="space-y-2 bg-red-600/10 border border-red-600/30 p-4 rounded-xl">
             <p className="text-red-500 font-black text-lg">CHEGAR ATÉ {currentDay ? HOUSE_POLICIES[currentDay].limit : '00:30H'}</p>
             <p className="text-zinc-300 text-[10px] font-bold">NÃO TOLERAMOS ATRASOS.</p>
          </div>
          <button onClick={resetApp} className="w-full py-5 gold-gradient text-black font-black rounded-xl hover:scale-105 transition-all shadow-xl tracking-widest">
            VOLTAR AO INÍCIO
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 selection:bg-gold-500 selection:text-black pb-20 uppercase tracking-tight">
      
      <div className="fixed top-4 right-4 z-50">
        <button onClick={() => setIsAdmin(!isAdmin)} className="text-[10px] text-zinc-700 font-black tracking-widest hover:text-zinc-400 transition-colors bg-white/5 px-4 py-2 rounded-full border border-white/10">
          {isAdmin ? 'SAIR ADMIN' : 'ADMIN'}
        </button>
      </div>

      <header className="py-20 px-6 text-center relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#d4af3711,transparent_70%)]"></div>
        <h1 className="text-6xl md:text-9xl font-serif gold-text tracking-tighter mb-4 cursor-default select-none font-black">BLACK NIGHT</h1>
        <p className="text-zinc-500 tracking-[0.6em] text-[10px] font-black opacity-80">LOUNGE EXPERIENCE</p>
      </header>

      <main className="max-w-4xl mx-auto px-6">
        {!isSystemOpen && !isAdmin ? (
          <div className="space-y-8 animate-fade-in text-center py-20">
            <h2 className="text-4xl font-serif gold-text font-black">RESERVAS ENCERRADAS</h2>
            <p className="text-zinc-500 text-sm max-w-md mx-auto leading-relaxed">SISTEMA ONLINE FECHADO ÀS 23H. VERIFIQUE NA PORTARIA.</p>
          </div>
        ) : (
          <>
            {!currentDay && !isAdmin && (
              <div className="space-y-12 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {(['Sexta', 'Sábado'] as ReservationDay[]).map((day) => (
                    <button key={day} onClick={() => handleSelectDay(day)} className="group relative glass-card rounded-[2.5rem] overflow-hidden transition-all hover:scale-[1.02] border-none shadow-2xl flex flex-col h-[600px]">
                      {flyers[day] ? (
                        <div className="absolute inset-0 z-0">
                          <img src={flyers[day]} alt={`Flyer ${day}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-80" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 z-0 bg-zinc-900 flex items-center justify-center opacity-40"><i className="fas fa-image text-4xl text-zinc-700"></i></div>
                      )}
                      <div className="relative z-10 mt-auto p-10 text-left">
                        <span className="block text-gold-500 text-[10px] font-black mb-2 tracking-[0.3em]">{HOUSE_POLICIES[day].description}</span>
                        <span className="block text-6xl font-serif text-white group-hover:gold-text transition-colors font-black tracking-tighter">{day}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentDay && !isAdmin && (
              <div className="space-y-10 animate-fade-in">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-white/5 pb-8">
                  <div className="text-center md:text-left">
                    <button onClick={() => setCurrentDay(null)} className="text-[10px] text-gold-500 font-black hover:underline mb-2 flex items-center gap-2">
                      <i className="fas fa-arrow-left text-[8px]"></i> TROCAR DIA
                    </button>
                    <h2 className="text-5xl font-serif text-white font-black tracking-tighter">{currentDay}</h2>
                  </div>
                </div>
                <LoungeMap reservations={reservations} onSelect={handleReservationClick} selectedId={selectedId} day={currentDay} prices={prices} />
              </div>
            )}
          </>
        )}

        {isAdmin && (
          <div className="space-y-12 animate-fade-in">
             <div className="flex flex-col md:flex-row justify-between items-end border-b-2 border-zinc-900 pb-8 gap-6">
               <h2 className="text-5xl font-serif gold-text font-black tracking-tighter">CONTROLE INTERNO</h2>
               <div className="flex gap-3">
                 <button onClick={() => setCurrentDay('Sexta')} className={`px-8 py-3 rounded-xl text-[10px] font-black transition-all ${currentDay === 'Sexta' ? 'gold-gradient text-black scale-105 shadow-lg' : 'bg-zinc-900 text-zinc-500'}`}>SEXTA</button>
                 <button onClick={() => setCurrentDay('Sábado')} className={`px-8 py-3 rounded-xl text-[10px] font-black transition-all ${currentDay === 'Sábado' ? 'gold-gradient text-black scale-105 shadow-lg' : 'bg-zinc-900 text-zinc-500'}`}>SÁBADO</button>
               </div>
             </div>

             {currentDay && (
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                 <div className="space-y-8">
                   <section className="space-y-4">
                     <h3 className="text-sm font-black text-zinc-500 mb-6 flex items-center gap-2 tracking-widest uppercase"><i className="fas fa-list-check"></i> RESERVAS ATIVAS</h3>
                     {reservations.filter(r => r.day === currentDay && r.status === 'reserved').length === 0 ? (
                       <div className="py-12 text-center text-zinc-700 italic border-2 border-dashed border-zinc-900 rounded-3xl uppercase font-black text-xs">SEM RESERVAS.</div>
                     ) : (
                       reservations.filter(r => r.day === currentDay && r.status === 'reserved').map(res => (
                        <div key={res.id} className="glass-card p-6 rounded-2xl flex flex-col gap-4 border-l-8 border-l-gold-500 hover:scale-[1.01] transition-transform cursor-pointer" onClick={() => setSelectedAdminRes(selectedAdminRes === res.id ? null : res.id)}>
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="px-3 py-1 bg-gold-500 text-black text-[9px] font-black rounded-full uppercase mb-2 inline-block">{res.type} #{res.number}</span>
                              <h4 className="text-xl font-black text-white">{res.customer?.fullName}</h4>
                            </div>
                            <div className="flex gap-2">
                               {res.customer?.receipt && (
                                 <button onClick={(e) => { e.stopPropagation(); setViewingReceipt(res.customer?.receipt || null); }} className="text-[10px] font-black text-gold-500 hover:bg-gold-500/10 px-4 py-2 rounded-xl border border-gold-500/20 uppercase">VER COMPROVANTE</button>
                               )}
                               <button onClick={(e) => { e.stopPropagation(); releaseReservation(res.id); }} className="text-[10px] font-black text-red-500 hover:bg-red-500/10 px-4 py-2 rounded-xl border border-red-500/20 uppercase">LIBERAR</button>
                            </div>
                          </div>
                          {selectedAdminRes === res.id && (
                            <div className="pt-4 border-t border-white/5 text-[10px] space-y-2 text-zinc-400 font-bold">
                              <p>TEL: {res.customer?.phone}</p>
                              <p>CONVIDADOS: {res.customer?.guests.join(', ')}</p>
                            </div>
                          )}
                        </div>
                       ))
                     )}
                   </section>

                   <section className="space-y-4">
                     <h3 className="text-sm font-black text-zinc-500 mb-6 flex items-center gap-2 tracking-widest uppercase"><i className="fas fa-image"></i> FLYER DA NOITE</h3>
                     <div className="glass-card p-6 rounded-[2rem] border-zinc-800 space-y-4 text-center">
                       {flyers[currentDay] && <img src={flyers[currentDay]} className="w-full h-32 object-cover rounded-xl mb-4" />}
                       <input type="file" accept="image/*" onChange={(e) => { if(e.target.files?.[0]) handleFlyerUpload(currentDay!, e.target.files[0]) }} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-[10px] font-black outline-none cursor-pointer" />
                     </div>
                   </section>
                 </div>

                 <div className="space-y-4">
                    <h3 className="text-sm font-black text-zinc-500 mb-6 flex items-center gap-2 tracking-widest uppercase"><i className="fas fa-money-bill-transfer"></i> GESTÃO DE VALORES</h3>
                    <div className="glass-card rounded-[2rem] overflow-hidden border-zinc-800 shadow-2xl">
                      <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left">
                          <thead className="bg-zinc-900 text-[10px] font-black text-zinc-500 sticky top-0 z-10 uppercase tracking-widest">
                            <tr><th className="p-4">LOCAL</th><th className="p-4">VALOR (R$)</th><th className="p-4">AÇÃO</th></tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900">
                            {[...Array(10)].map((_, i) => {
                              const num = (i+1).toString().padStart(2, '0');
                              const id = `${currentDay}|${ReservationType.VIP_BOOTH}|${num}`;
                              return (
                                <tr key={id} className="hover:bg-white/5 transition-colors">
                                  <td className="p-4 text-[10px] font-black uppercase">CAM {num}</td>
                                  <td className="p-4">
                                    <input type="number" value={prices[id] || ""} onChange={(e) => updatePrice(id, e.target.value)} placeholder="1500" className="bg-black/40 border border-zinc-800 rounded-lg px-3 py-1 text-xs w-24 text-gold-500 font-black outline-none" />
                                  </td>
                                  <td className="p-4">
                                    <button onClick={() => toggleBlockStatus(id)} className={`text-[8px] font-black px-2 py-1 rounded border transition-colors ${reservations.find(r => r.id === id)?.status === 'blocked' ? 'bg-red-500 text-white' : 'border-zinc-700'}`}>
                                      {reservations.find(r => r.id === id)?.status === 'blocked' ? 'BLOQUEADO' : 'BLOQUEAR'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                 </div>
               </div>
             )}
          </div>
        )}
      </main>

      {viewingReceipt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/98 backdrop-blur-2xl" onClick={() => setViewingReceipt(null)}>
          <div className="relative max-w-2xl w-full bg-zinc-900 p-4 rounded-3xl animate-scale-up border border-white/10" onClick={e => e.stopPropagation()}>
            <img src={viewingReceipt} className="w-full h-auto rounded-xl shadow-2xl" alt="Comprovante" />
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl overflow-y-auto uppercase">
          <div className="glass-card w-full max-w-2xl p-12 rounded-[3rem] border-gold-500 shadow-2xl animate-scale-up my-auto">
            <h2 className="text-4xl font-serif gold-text font-black uppercase mb-8">RESERVANDO {selectedId?.split('|').slice(1).join(' #')}</h2>
            <form onSubmit={handleConfirmReservation} className="space-y-6">
              <input required type="text" placeholder="NOME COMPLETO" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[#111] border-2 border-zinc-900 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500 outline-none" />
              <input required type="number" placeholder="IDADE" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="w-full bg-[#111] border-2 border-zinc-900 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500 outline-none" />
              <input required type="tel" placeholder="WHATSAPP" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-[#111] border-2 border-zinc-900 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500 outline-none" />
              <textarea placeholder="LISTA DE CONVIDADOS (UM POR LINHA)" value={formData.guests} onChange={e => setFormData({...formData, guests: e.target.value})} className="w-full h-32 bg-[#111] border-2 border-zinc-900 rounded-2xl px-6 py-4 text-sm font-bold focus:border-gold-500 outline-none resize-none"></textarea>
              <button type="submit" className="w-full py-6 gold-gradient text-black font-black text-lg tracking-[0.2em] rounded-2xl shadow-2xl">CONTINUAR PARA PAGAMENTO</button>
              <button type="button" onClick={() => setShowForm(false)} className="w-full py-2 text-[10px] text-zinc-500 font-bold hover:text-white transition-colors">CANCELAR</button>
            </form>
          </div>
        </div>
      )}

      {showPayment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl overflow-y-auto uppercase">
          <div className="glass-card w-full max-w-md p-10 rounded-[3rem] border-gold-500 shadow-2xl text-center animate-scale-up">
            <h2 className="text-3xl font-serif gold-text font-black mb-4 uppercase">PAGAMENTO PIX</h2>
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 mb-6">
              <p className="text-white font-black break-all text-xs tracking-widest font-mono">{PIX_KEY}</p>
              <button onClick={handleCopyPix} className="text-[9px] font-black mt-3 text-gold-500 underline">{copyFeedback ? 'COPIADO!' : 'COPIAR CHAVE'}</button>
            </div>
            <div className="space-y-4">
              <p className="text-[10px] text-zinc-400 font-bold">ANEXE O COMPROVANTE PARA LIBERAÇÃO</p>
              <input type="file" accept="image/*" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-[10px] font-black" />
              <button onClick={handlePaymentFinish} className="w-full py-6 gold-gradient text-black font-black text-lg tracking-[0.2em] rounded-2xl mt-4">FINALIZAR RESERVA</button>
              <button type="button" onClick={() => setShowPayment(false)} className="w-full py-2 text-[10px] text-zinc-500 font-bold hover:text-white transition-colors">VOLTAR</button>
            </div>
          </div>
        </div>
      )}

      <ConciergeChat />
    </div>
  );
};

export default App;
