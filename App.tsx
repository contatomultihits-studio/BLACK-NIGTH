
import React, { useState, useEffect } from 'react';
import { Reservation, ReservationDay, ReservationType } from './types';
import { HOUSE_POLICIES, PIX_KEY, CAMAROTES_LEFT, CAMAROTES_RIGHT, CAMAROTES_BOTTOM, MESAS_CENTER } from './constants';
import LoungeMap from './components/LoungeMap';
import ConciergeChat from './components/ConciergeChat';
import { supabase } from './services/supabase';

const ADMIN_USER = "BLACK";
const ADMIN_PASSWORD = "black979@@#";
const LOCK_TIME_MS = 15 * 60 * 1000;

const App: React.FC = () => {
  const [view, setView] = useState<'client' | 'admin_login' | 'admin_panel'>('client');
  const [adminTab, setAdminTab] = useState<'config' | 'reports'>('config');
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' });
  const [currentDay, setCurrentDay] = useState<ReservationDay | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pendingPrices, setPendingPrices] = useState<Record<string, number>>({});
  const [flyers, setFlyers] = useState<Record<string, string>>({});
  const [pendingFlyer, setPendingFlyer] = useState<string | null>(null);
  const [updateLogs, setUpdateLogs] = useState<{ prices?: string; flyers?: string }>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [isSavingFlyer, setIsSavingFlyer] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);

  const [formData, setFormData] = useState({ name: '', phone: '', guests: '', age: '' });

  const getAllItemIds = (day: ReservationDay) => {
    const camarotes = [...CAMAROTES_LEFT, ...CAMAROTES_RIGHT, ...CAMAROTES_BOTTOM].sort().map(num => ({
      id: `${day}|${ReservationType.VIP_BOOTH}|${num}`,
      type: ReservationType.VIP_BOOTH,
      num
    }));
    const mesas = MESAS_CENTER.flat().sort().map(num => ({
      id: `${day}|${ReservationType.TABLE_BISTRO}|${num}`,
      type: ReservationType.TABLE_BISTRO,
      num
    }));
    return { camarotes, mesas };
  };

  useEffect(() => {
    const init = async () => {
      if (!supabase) { setIsLoading(false); return; }

      const { data: resData } = await supabase.from('reservations').select('*');
      const { data: configData } = await supabase.from('app_config').select('*');

      if (resData) setReservations(resData);
      if (configData) {
        const p = configData.find(c => c.key === 'prices');
        const f = configData.find(c => c.key === 'flyers');
        const u = configData.find(c => c.key === 'update_logs');
        if (p) { setPrices(p.value || {}); setPendingPrices(p.value || {}); }
        if (f) setFlyers(f.value || {});
        if (u) setUpdateLogs(u.value || {});
      }

      // Iniciar canais em tempo real para garantir sincronização total
      supabase.channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, payload => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setReservations(prev => [...prev.filter(r => r.id !== payload.new.id), payload.new as Reservation]);
          } else if (payload.eventType === 'DELETE') {
            setReservations(prev => prev.filter(r => r.id !== payload.old.id));
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, payload => {
          const newData = payload.new as { key: string, value: any };
          if (newData.key === 'prices') { setPrices(newData.value); setPendingPrices(newData.value); }
          if (newData.key === 'flyers') setFlyers(newData.value);
          if (newData.key === 'update_logs') setUpdateLogs(newData.value);
        })
        .subscribe();

      setIsLoading(false);
    };

    init();
    if (localStorage.getItem('bn_admin_auth') === 'true') setView('admin_panel');
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginForm.user.trim().toUpperCase() === ADMIN_USER && loginForm.pass === ADMIN_PASSWORD) {
      localStorage.setItem('bn_admin_auth', 'true');
      setView('admin_panel');
    } else { alert("ACESSO NEGADO."); }
  };

  const handleSelectSpot = async (id: string) => {
    if (!supabase) return;
    const { data: existing } = await supabase.from('reservations').select('*').eq('id', id).single();
    if (existing && (existing.status === 'reserved' || existing.status === 'blocked')) {
      alert("ESTE LUGAR JÁ NÃO ESTÁ DISPONÍVEL.");
      return;
    }
    const parts = id.split('|');
    const lock: Reservation = {
      id, day: parts[0] as ReservationDay, type: parts[1] as ReservationType, number: parts[2],
      status: 'pending', price: prices[id] || (parts[1] === ReservationType.VIP_BOOTH ? 1500 : 400),
      expires_at: Date.now() + LOCK_TIME_MS
    };
    await supabase.from('reservations').upsert(lock);
    setSelectedId(id);
    setShowForm(true);
  };

  const toggleLock = async (id: string, type: ReservationType, num: string) => {
    if (!supabase || !currentDay) return;
    const res = reservations.find(r => r.id === id);
    if (res?.status === 'blocked') {
      await supabase.from('reservations').delete().eq('id', id);
    } else {
      if (res?.status !== 'reserved') {
        await supabase.from('reservations').upsert({
          id, day: currentDay, type, number: num, status: 'blocked',
          price: pendingPrices[id] || (type === ReservationType.VIP_BOOTH ? 1500 : 400)
        });
      } else { alert("NÃO PODE BLOQUEAR UM LOCAL JÁ VENDIDO."); }
    }
  };

  const handlePriceChange = (id: string, value: string) => {
    setPendingPrices(prev => ({ ...prev, [id]: parseInt(value) || 0 }));
  };

  const saveAllPrices = async () => {
    setIsSavingPrices(true);
    const now = new Date().toLocaleString('pt-BR');
    const newLogs = { ...updateLogs, prices: now };
    try {
      await supabase?.from('app_config').upsert({ key: 'prices', value: pendingPrices });
      await supabase?.from('app_config').upsert({ key: 'update_logs', value: newLogs });
      setPrices(pendingPrices); setUpdateLogs(newLogs);
      alert("PREÇOS ATUALIZADOS!");
    } catch { alert("ERRO AO SALVAR."); }
    finally { setIsSavingPrices(false); }
  };

  const saveFlyer = async () => {
    if (!currentDay || !pendingFlyer) return;
    setIsSavingFlyer(true);
    const now = new Date().toLocaleString('pt-BR');
    const newLogs = { ...updateLogs, flyers: now };
    const newFlyers = { ...flyers, [currentDay]: pendingFlyer };
    try {
      await supabase?.from('app_config').upsert({ key: 'flyers', value: newFlyers });
      await supabase?.from('app_config').upsert({ key: 'update_logs', value: newLogs });
      setFlyers(newFlyers); setUpdateLogs(newLogs); setPendingFlyer(null);
      alert("FLYER ATUALIZADO NO SITE!");
    } catch { alert("ERRO AO SALVAR FLYER."); }
    finally { setIsSavingFlyer(false); }
  };

  // Added missing handleFlyerPreview function to handle flyer image uploads and preview
  const handleFlyerPreview = (day: ReservationDay, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setPendingFlyer(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePaymentFinish = async () => {
    if (!selectedId || !currentDay || !supabase || !receiptFile) return;
    const parts = selectedId.split('|');
    const reader = new FileReader();
    reader.readAsDataURL(receiptFile);
    reader.onload = async () => {
      const receiptBase64 = reader.result as string;
      const newRes: Reservation = {
        id: selectedId, day: currentDay, type: parts[1] as ReservationType, number: parts[2],
        status: 'reserved', price: prices[selectedId] || (parts[1] === ReservationType.VIP_BOOTH ? 1500 : 400),
        customer: {
          fullName: formData.name.toUpperCase(), birthDate: '', cpf: '', phone: formData.phone, age: formData.age,
          guests: formData.guests.split('\n').filter(g => g.trim()).map(g => g.toUpperCase()),
          timestamp: Date.now(), receipt: receiptBase64
        }
      };
      await supabase.from('reservations').upsert(newRes);
      setShowPayment(false); setShowSuccess(true);
    };
  };

  if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center gold-text font-black text-2xl animate-pulse">BLACK NIGHT...</div>;

  if (view === 'admin_login') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="glass-card max-w-lg w-full p-16 rounded-[4rem] text-center border-gold-500/20 shadow-2xl animate-scale-up">
          <i className="fas fa-crown text-gold-500 text-5xl mb-10"></i>
          <h2 className="text-3xl font-serif gold-text font-black mb-10">ACESSO ADMIN</h2>
          <form onSubmit={handleAdminLogin} className="space-y-6">
            <input type="text" placeholder="USUÁRIO" value={loginForm.user} onChange={e => setLoginForm({...loginForm, user: e.target.value})} className="w-full bg-black border-2 border-zinc-800 rounded-2xl px-8 py-5 font-black focus:border-gold-500 outline-none uppercase text-white" />
            <input type="password" placeholder="SENHA" value={loginForm.pass} onChange={e => setLoginForm({...loginForm, pass: e.target.value})} className="w-full bg-black border-2 border-zinc-800 rounded-2xl px-8 py-5 font-black focus:border-gold-500 outline-none text-white" />
            <button className="w-full py-6 gold-gradient text-black font-black rounded-2xl shadow-xl hover:scale-[1.02] transition-transform">ENTRAR</button>
            <button type="button" onClick={() => setView('client')} className="text-zinc-600 font-black text-[10px] tracking-widest uppercase mt-4">SAIR</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'admin_panel') {
    const { camarotes, mesas } = currentDay ? getAllItemIds(currentDay) : { camarotes: [], mesas: [] };
    const reservedList = reservations.filter(r => r.status === 'reserved');

    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-12 uppercase">
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-12 gap-8">
          <h1 className="text-4xl font-serif gold-text font-black">BLACK PANEL</h1>
          <div className="flex bg-zinc-900 p-2 rounded-2xl border border-white/5">
            <button onClick={() => setAdminTab('config')} className={`px-8 py-4 rounded-xl text-[10px] font-black transition-all ${adminTab === 'config' ? 'gold-gradient text-black' : 'text-zinc-500'}`}>MAPA & PREÇOS</button>
            <button onClick={() => setAdminTab('reports')} className={`px-8 py-4 rounded-xl text-[10px] font-black transition-all ${adminTab === 'reports' ? 'gold-gradient text-black' : 'text-zinc-500'}`}>RELATÓRIO MASTER</button>
          </div>
          <button onClick={() => { localStorage.removeItem('bn_admin_auth'); setView('client'); }} className="px-8 py-3 bg-red-600/10 text-red-500 border border-red-600/20 rounded-xl font-black text-xs">SAIR</button>
        </header>

        <main className="max-w-7xl mx-auto">
          {adminTab === 'config' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-7 space-y-10">
                <div className="flex gap-4">
                  {(['Sexta', 'Sábado'] as ReservationDay[]).map(d => (
                    <button key={d} onClick={() => { setCurrentDay(d); setPendingFlyer(null); }} className={`flex-1 py-6 rounded-[2rem] font-black text-sm transition-all ${currentDay === d ? 'gold-gradient text-black' : 'bg-zinc-900 text-zinc-600'}`}>{d}</button>
                  ))}
                </div>
                {currentDay && (
                  <div className="glass-card p-10 rounded-[3rem] border-zinc-800">
                    <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
                      <h3 className="text-xs font-black text-gold-500 tracking-widest">MAPA DO DIA</h3>
                      <div className="text-right"><p className="text-[8px] text-zinc-500 font-bold mb-1">ÚLTIMA ATUALIZAÇÃO</p><p className="text-xs text-zinc-300 font-black">{updateLogs.prices || '--/--/----'}</p></div>
                    </div>
                    <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                      {[...camarotes, ...mesas].map(({ id, num, type }) => {
                        const res = reservations.find(r => r.id === id);
                        return (
                          <div key={id} className={`flex items-center justify-between p-6 rounded-3xl border-2 ${res?.status === 'reserved' ? 'bg-gold-500/5 border-gold-500/20' : 'bg-black border-zinc-900'}`}>
                            <div><span className="text-[9px] text-zinc-500 font-black">{type}</span><p className="text-2xl font-black text-white">{num}</p></div>
                            <div className="flex items-center gap-4">
                              <input type="number" value={pendingPrices[id] || ''} onChange={e => handlePriceChange(id, e.target.value)} className="w-28 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-gold-500 font-black text-center" />
                              <button onClick={() => toggleLock(id, type, num)} disabled={res?.status === 'reserved'} className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl ${res?.status === 'blocked' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-500 disabled:opacity-20'}`}><i className={`fas fa-${res?.status === 'blocked' ? 'lock' : 'unlock'}`}></i></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={saveAllPrices} className="w-full mt-10 py-6 gold-gradient text-black font-black rounded-3xl text-lg shadow-2xl">SALVAR TODOS OS PREÇOS</button>
                  </div>
                )}
              </div>
              <div className="lg:col-span-5">
                <section className="glass-card p-10 rounded-[3rem] border-zinc-800">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xs font-black text-gold-500 tracking-widest">FLYER DO SITE</h3>
                    <div className="text-right"><p className="text-[8px] text-zinc-500 font-bold mb-1">ÚLTIMA TROCA</p><p className="text-xs text-zinc-300 font-black">{updateLogs.flyers || '--/--/----'}</p></div>
                  </div>
                  {currentDay && (
                    <div className="space-y-6 text-center">
                      <div className="aspect-[3/4] bg-zinc-900 rounded-[2.5rem] overflow-hidden border-2 border-zinc-800 flex items-center justify-center">
                        {pendingFlyer || flyers[currentDay] ? <img src={pendingFlyer || flyers[currentDay]} className="w-full h-full object-cover" /> : <i className="fas fa-image text-zinc-800 text-6xl"></i>}
                      </div>
                      <label className="block w-full py-5 bg-zinc-800 text-zinc-300 text-center rounded-2xl cursor-pointer font-black text-xs border border-zinc-700">CARREGAR FLYER<input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleFlyerPreview(currentDay!, e.target.files[0])} /></label>
                      {pendingFlyer && <button onClick={saveFlyer} className="w-full py-5 gold-gradient text-black font-black rounded-2xl text-xs">SALVAR NO SITE AGORA</button>}
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-[3rem] overflow-hidden border-white/5 shadow-2xl animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-zinc-900 text-[10px] font-black text-gold-500 tracking-widest uppercase">
                    <tr><th className="p-8">LOCAL</th><th className="p-8">CLIENTE</th><th className="p-8">DIA</th><th className="p-8">VALOR</th><th className="p-8">CONVIDADOS</th><th className="p-8">AÇÕES</th></tr>
                  </thead>
                  <tbody className="text-xs font-bold text-zinc-400">
                    {reservedList.map(res => (
                      <tr key={res.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-8"><span className="text-lg font-black text-white">{res.number}</span> <span className="text-[8px]">{res.type}</span></td>
                        <td className="p-8"><p className="text-white font-black">{res.customer?.fullName}</p><p className="text-[10px] text-green-500">{res.customer?.phone}</p></td>
                        <td className="p-8">{res.day}</td>
                        <td className="p-8 text-gold-500">R$ {res.price}</td>
                        <td className="p-8 text-[9px]">{res.customer?.guests.length} PESSOAS</td>
                        <td className="p-8 flex gap-3">
                          {res.customer?.receipt && <button onClick={() => setViewingReceipt(res.customer?.receipt || null)} className="w-10 h-10 bg-white/5 text-gold-500 rounded-lg hover:bg-gold-500 hover:text-black"><i className="fas fa-receipt"></i></button>}
                          <button onClick={async () => { if(confirm("REMOVER?")) await supabase?.from('reservations').delete().eq('id', res.id); }} className="w-10 h-10 bg-red-600/10 text-red-500 rounded-lg hover:bg-red-600 hover:text-white"><i className="fas fa-trash-alt"></i></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
        {viewingReceipt && <div className="fixed inset-0 z-[250] bg-black/98 flex items-center justify-center p-6" onClick={() => setViewingReceipt(null)}><img src={viewingReceipt} className="max-w-2xl w-full rounded-[3rem] border-8 border-gold-500 shadow-2xl" alt="Comprovante" /></div>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-gold-500 selection:text-black">
      <header className="py-24 text-center relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#d4af3715,transparent_75%)] opacity-60"></div>
        <h1 className="text-8xl md:text-[10rem] font-serif gold-text font-black tracking-tighter mb-4 relative z-10 select-none">BLACK NIGHT</h1>
        <p className="text-zinc-500 tracking-[1.2em] text-[11px] font-black relative z-10 uppercase">PREMIUM LOUNGE EXPERIENCE</p>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-40">
        {!currentDay ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 animate-fade-in">
            {(['Sexta', 'Sábado'] as ReservationDay[]).map(day => (
              <button key={day} onClick={() => setCurrentDay(day)} className="group relative glass-card rounded-[5rem] overflow-hidden h-[700px] shadow-2xl transition-all hover:scale-[1.02]">
                {flyers[day] ? <img src={flyers[day]} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-1000" /> : <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center"><i className="fas fa-image text-7xl text-zinc-800"></i></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent"></div>
                <div className="relative z-10 p-20 mt-auto text-left"><span className="block text-gold-500 text-[11px] font-black mb-4 tracking-widest">{HOUSE_POLICIES[day].description}</span><span className="block text-8xl font-serif text-white group-hover:gold-text transition-colors font-black tracking-tighter">{day}</span></div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-12 animate-fade-in">
            <button onClick={() => setCurrentDay(null)} className="text-[11px] text-gold-500 font-black flex items-center gap-3 tracking-widest uppercase"><i className="fas fa-arrow-left"></i> VOLTAR PARA SELEÇÃO</button>
            <h2 className="text-7xl font-serif font-black tracking-tighter uppercase">{currentDay}</h2>
            <LoungeMap reservations={reservations} onSelect={handleSelectSpot} selectedId={selectedId} day={currentDay} prices={prices} />
          </div>
        )}
      </main>

      <footer className="py-24 border-t border-white/5 text-center bg-black/60 backdrop-blur-2xl relative mt-20">
         <p className="text-[11px] text-zinc-800 font-black tracking-[0.8em] uppercase">© BLACK NIGHT LOUNGE</p>
         <button onClick={() => setView('admin_login')} className="w-32 h-32 bg-zinc-900/30 text-zinc-800 hover:text-gold-500 transition-all duration-700 rounded-full flex items-center justify-center mx-auto border-2 border-zinc-900/50 hover:border-gold-500 group shadow-2xl mt-12"><i className="fas fa-lock text-5xl opacity-20 group-hover:opacity-100 transition-transform"></i></button>
      </footer>

      {showForm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/96 backdrop-blur-2xl">
          <div className="glass-card w-full max-w-3xl p-16 rounded-[5rem] animate-scale-up border-gold-500/20 shadow-2xl">
            <h2 className="text-5xl font-serif gold-text font-black mb-12 uppercase tracking-tight">SUA RESERVA</h2>
            <form onSubmit={e => { e.preventDefault(); if(parseInt(formData.age) < 18) return alert("APENAS +18."); setShowForm(false); setShowPayment(true); }} className="space-y-8">
              <input required type="text" placeholder="NOME COMPLETO" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-6 text-base font-black focus:border-gold-500 outline-none text-white uppercase" />
              <div className="grid grid-cols-2 gap-6">
                <input required type="number" placeholder="IDADE" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-6 text-base font-black focus:border-gold-500 outline-none text-white" />
                <input required type="tel" placeholder="WHATSAPP" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-6 text-base font-black focus:border-gold-500 outline-none text-white" />
              </div>
              <textarea placeholder="CONVIDADOS (UM POR LINHA)" value={formData.guests} onChange={e => setFormData({...formData, guests: e.target.value})} className="w-full h-40 bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-6 text-base font-black focus:border-gold-500 outline-none resize-none uppercase text-white"></textarea>
              <button type="submit" className="w-full py-8 gold-gradient text-black font-black rounded-[2.5rem] text-xl shadow-2xl uppercase tracking-widest">AVANÇAR</button>
              <button type="button" onClick={() => setShowForm(false)} className="w-full text-zinc-700 font-black text-xs mt-2 uppercase tracking-widest">CANCELAR</button>
            </form>
          </div>
        </div>
      )}

      {showPayment && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/99 backdrop-blur-3xl">
          <div className="glass-card w-full max-w-xl p-16 rounded-[5rem] text-center border-gold-500 shadow-2xl animate-scale-up">
            <h2 className="text-4xl font-serif gold-text font-black mb-10 uppercase">PAGAMENTO PIX</h2>
            <div className="bg-zinc-950 p-10 rounded-[3.5rem] border-2 border-zinc-900 mb-10">
              <p className="text-white font-mono break-all text-xs opacity-60 mb-6">{PIX_KEY}</p>
              <button onClick={() => { navigator.clipboard.writeText(PIX_KEY); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }} className="gold-gradient text-black px-12 py-4 rounded-full text-xs font-black uppercase">{copyFeedback ? 'COPIADO!' : 'COPIAR CHAVE PIX'}</button>
            </div>
            <div className="text-left space-y-4 mb-10">
               <label className="text-[11px] font-black text-zinc-500 ml-6 uppercase">ANEXAR COMPROVANTE (OBRIGATÓRIO)</label>
               <input required type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="w-full bg-black border-2 border-zinc-900 rounded-[2.5rem] px-8 py-6 text-xs text-zinc-400 file:bg-zinc-800 file:text-gold-500 file:border-0 file:rounded-full file:px-4 file:py-1" />
            </div>
            <button onClick={handlePaymentFinish} disabled={!receiptFile} className={`w-full py-8 font-black rounded-[2.5rem] text-xl shadow-2xl uppercase ${receiptFile ? 'gold-gradient text-black' : 'bg-zinc-900 text-zinc-700 opacity-40'}`}>FINALIZAR RESERVA</button>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-[130] bg-black flex items-center justify-center p-6 text-center animate-fade-in">
          <div className="glass-card max-w-2xl w-full p-20 rounded-[6rem] space-y-10 border-gold-500/50 shadow-2xl animate-scale-up">
            <div className="w-32 h-32 gold-gradient rounded-full flex items-center justify-center mx-auto"><i className="fas fa-check text-5xl text-black"></i></div>
            <h1 className="text-5xl font-serif gold-text font-black uppercase">SOLICITAÇÃO ENVIADA!</h1>
            <p className="text-zinc-400 text-sm font-black uppercase px-8">ESTAMOS VALIDANDO SEU COMPROVANTE. AGUARDE O CONTATO VIA WHATSAPP.</p>
            <button onClick={() => { setShowSuccess(false); setCurrentDay(null); }} className="w-full py-8 gold-gradient text-black font-black rounded-[3rem] uppercase text-base shadow-2xl">VOLTAR AO INÍCIO</button>
          </div>
        </div>
      )}

      <ConciergeChat />
    </div>
  );
};

export default App;
