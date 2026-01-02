
import React, { useState, useEffect } from 'react';
import { Reservation, ReservationDay, ReservationType } from './types';
import { HOUSE_POLICIES, PIX_KEY, CAMAROTES_LEFT, CAMAROTES_RIGHT, CAMAROTES_BOTTOM, MESAS_CENTER } from './constants';
import LoungeMap from './components/LoungeMap';
import ConciergeChat from './components/ConciergeChat';
import { supabase } from './services/supabase';

const ADMIN_USER = "BLACK";
const ADMIN_PASSWORD = "black979@@#";
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutos

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

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    guests: '',
    age: ''
  });

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
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      const { data: resData } = await supabase.from('reservations').select('*');
      const { data: configData } = await supabase.from('app_config').select('*');

      if (resData) setReservations(resData);
      if (configData) {
        const p = configData.find(c => c.key === 'prices');
        const f = configData.find(c => c.key === 'flyers');
        const u = configData.find(c => c.key === 'update_logs');
        if (p) {
          setPrices(p.value || {});
          setPendingPrices(p.value || {});
        }
        if (f) setFlyers(f.value || {});
        if (u) setUpdateLogs(u.value || {});
      }

      // Realtime Subscriptions
      supabase.channel('public:reservations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, payload => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setReservations(prev => [...prev.filter(r => r.id !== payload.new.id), payload.new as Reservation]);
          } else if (payload.eventType === 'DELETE') {
            setReservations(prev => prev.filter(r => r.id !== payload.old.id));
          }
        }).subscribe();

      supabase.channel('public:app_config')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, payload => {
          const newData = payload.new as { key: string, value: any };
          if (newData.key === 'prices') {
            setPrices(newData.value);
            setPendingPrices(newData.value);
          }
          if (newData.key === 'flyers') setFlyers(newData.value);
          if (newData.key === 'update_logs') setUpdateLogs(newData.value);
        }).subscribe();

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
      setLoginForm({ user: '', pass: '' });
    } else {
      alert("ACESSO NEGADO.");
    }
  };

  const handleSelectSpot = async (id: string) => {
    if (!supabase) return;
    const { data: existing } = await supabase.from('reservations').select('*').eq('id', id).single();
    const now = Date.now();
    if (existing) {
      if (existing.status === 'reserved' || existing.status === 'blocked') {
        alert("ESTE LUGAR ACABOU DE SER RESERVADO OU BLOQUEADO.");
        return;
      }
      if (existing.status === 'pending' && existing.expires_at > now) {
        alert("ALGUÉM ESTÁ TENTANDO RESERVAR ESTE LUGAR AGORA.");
        return;
      }
    }

    const parts = id.split('|');
    const lock: Reservation = {
      id,
      day: parts[0] as ReservationDay,
      type: parts[1] as ReservationType,
      number: parts[2],
      status: 'pending',
      price: prices[id] || (parts[1] === ReservationType.VIP_BOOTH ? 1500 : 400),
      expires_at: now + LOCK_TIME_MS
    };

    const { error } = await supabase.from('reservations').upsert(lock);
    if (!error) {
      setSelectedId(id);
      setReceiptFile(null);
      setShowForm(true);
    }
  };

  const toggleLock = async (id: string, type: ReservationType, num: string) => {
    if (!supabase || !currentDay) return;
    const res = reservations.find(r => r.id === id);
    
    if (res?.status === 'blocked') {
      await supabase.from('reservations').delete().eq('id', id);
    } else {
      if (res?.status !== 'reserved') {
        await supabase.from('reservations').upsert({
          id,
          day: currentDay,
          type,
          number: num,
          status: 'blocked',
          price: pendingPrices[id] || 0
        });
      } else {
        alert("NÃO É POSSÍVEL BLOQUEAR UM LOCAL JÁ RESERVADO POR CLIENTE.");
      }
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
      setPrices(pendingPrices);
      setUpdateLogs(newLogs);
      alert("VALORES ATUALIZADOS COM SUCESSO!");
    } catch (err) {
      alert("ERRO AO SALVAR PREÇOS.");
    } finally {
      setIsSavingPrices(false);
    }
  };

  const handleFlyerPreview = (day: ReservationDay, file: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      setPendingFlyer(reader.result as string);
    };
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
      setFlyers(newFlyers);
      setUpdateLogs(newLogs);
      setPendingFlyer(null);
      alert("FLYER SALVO COM SUCESSO!");
    } catch (err) {
      alert("ERRO AO SALVAR FLYER.");
    } finally {
      setIsSavingFlyer(false);
    }
  };

  const handlePaymentFinish = async () => {
    if (!selectedId || !currentDay || !supabase || !receiptFile) return;
    const parts = selectedId.split('|');
    const finalPrice = prices[selectedId] || (parts[1] === ReservationType.VIP_BOOTH ? 1500 : 400);

    const reader = new FileReader();
    reader.readAsDataURL(receiptFile);
    reader.onload = async () => {
      const receiptBase64 = reader.result as string;
      const newRes: Reservation = {
        id: selectedId,
        day: currentDay,
        type: parts[1] as ReservationType,
        number: parts[2],
        status: 'reserved',
        price: finalPrice,
        customer: {
          fullName: formData.name.toUpperCase(),
          birthDate: '',
          cpf: '',
          phone: formData.phone,
          guests: formData.guests.split('\n').filter(g => g.trim() !== '').map(g => g.toUpperCase()),
          timestamp: Date.now(),
          age: formData.age,
          receipt: receiptBase64
        }
      };
      await supabase.from('reservations').upsert(newRes);
      setShowPayment(false);
      setShowSuccess(true);
    };
  };

  if (isLoading) return <div className="min-h-screen bg-black flex flex-col items-center justify-center gold-text font-black animate-pulse"><div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin mb-6"></div>BLACK NIGHT</div>;

  if (view === 'admin_login') {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="glass-card max-w-lg w-full p-16 rounded-[4rem] text-center space-y-10 animate-scale-up border-gold-500/30">
          <div className="w-24 h-24 bg-gold-500/10 rounded-full flex items-center justify-center mx-auto ring-2 ring-gold-500/20">
            <i className="fas fa-crown text-gold-500 text-4xl"></i>
          </div>
          <div>
            <h2 className="text-4xl font-serif gold-text font-black">ACESSO RESTRITO</h2>
            <p className="text-[10px] text-zinc-500 font-bold tracking-[0.4em] mt-2">BLACK ADMIN PANEL</p>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-6">
            <input type="text" placeholder="USUÁRIO" value={loginForm.user} onChange={e => setLoginForm({...loginForm, user: e.target.value})} className="w-full bg-black/60 border-2 border-zinc-800 rounded-3xl px-8 py-5 font-black focus:border-gold-500 outline-none uppercase text-white" />
            <input type="password" placeholder="SENHA" value={loginForm.pass} onChange={e => setLoginForm({...loginForm, pass: e.target.value})} className="w-full bg-black/60 border-2 border-zinc-800 rounded-3xl px-8 py-5 font-black focus:border-gold-500 outline-none text-white" />
            <button className="w-full py-6 gold-gradient text-black font-black rounded-3xl shadow-2xl text-lg hover:scale-[1.02] transition-transform">ENTRAR NO SISTEMA</button>
            <button type="button" onClick={() => setView('client')} className="text-zinc-600 font-black text-[10px] tracking-widest uppercase hover:text-white transition-colors">VOLTAR AO SITE</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'admin_panel') {
    const { camarotes, mesas } = currentDay ? getAllItemIds(currentDay) : { camarotes: [], mesas: [] };
    const reservedList = reservations.filter(r => r.status === 'reserved');
    const totalRevenue = reservedList.reduce((acc, curr) => acc + (curr.price || 0), 0);

    return (
      <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12 uppercase">
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-12 border-b border-white/5 pb-8 gap-8">
          <div>
            <h1 className="text-5xl font-serif gold-text font-black tracking-tight">ADMIN MASTER</h1>
            <p className="text-[10px] text-zinc-500 font-bold tracking-[0.4em]">CONTROLE TOTAL BLACK NIGHT</p>
          </div>
          
          <div className="flex bg-zinc-900/50 p-2 rounded-2xl border border-white/5">
            <button onClick={() => setAdminTab('config')} className={`px-8 py-4 rounded-xl text-[10px] font-black transition-all ${adminTab === 'config' ? 'gold-gradient text-black shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-white'}`}>MAPA & PREÇOS</button>
            <button onClick={() => setAdminTab('reports')} className={`px-8 py-4 rounded-xl text-[10px] font-black transition-all ${adminTab === 'reports' ? 'gold-gradient text-black shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-white'}`}>RELATÓRIO MASTER</button>
          </div>

          <button onClick={() => { localStorage.removeItem('bn_admin_auth'); setView('client'); }} className="px-10 py-4 bg-red-600/10 text-red-500 border border-red-600/20 rounded-xl font-black text-xs hover:bg-red-600 hover:text-white transition-all">SAIR</button>
        </header>

        <main className="max-w-7xl mx-auto">
          {adminTab === 'config' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-7 space-y-10">
                <div className="flex gap-4">
                  {(['Sexta', 'Sábado'] as ReservationDay[]).map(d => (
                    <button key={d} onClick={() => { setCurrentDay(d); setPendingFlyer(null); }} className={`flex-1 py-8 rounded-[2rem] font-black text-sm transition-all shadow-2xl ${currentDay === d ? 'gold-gradient text-black scale-[1.02]' : 'bg-zinc-900 text-zinc-600 border border-zinc-800'}`}>{d}</button>
                  ))}
                </div>

                {currentDay ? (
                  <div className="glass-card p-10 rounded-[3.5rem] border-zinc-800 shadow-2xl relative overflow-hidden">
                    <div className="flex justify-between items-center mb-10 border-b border-white/5 pb-6">
                      <h3 className="text-sm font-black text-gold-500 tracking-[0.3em]">VALORES E TRAVAS ({currentDay})</h3>
                      <div className="text-right">
                        <p className="text-[8px] text-zinc-600 font-bold mb-1 tracking-widest">ÚLTIMA ATUALIZAÇÃO</p>
                        <p className="text-xs text-zinc-300 font-black tracking-tighter">{updateLogs.prices || '--/--/----'}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4 max-h-[700px] overflow-y-auto custom-scrollbar pr-4">
                      {[...camarotes, ...mesas].map(({ id, num, type }) => {
                        const res = reservations.find(r => r.id === id);
                        const isBlocked = res?.status === 'blocked';
                        const isRes = res?.status === 'reserved';
                        return (
                          <div key={id} className={`flex items-center justify-between p-6 rounded-3xl border-2 transition-all ${isRes ? 'bg-gold-500/5 border-gold-500/20' : 'bg-black/40 border-white/5 hover:border-zinc-800'}`}>
                            <div className="flex flex-col">
                              <span className="text-[10px] text-zinc-500 font-black mb-1">{type.toUpperCase()}</span>
                              <span className="text-2xl font-black text-white">{num} {isRes && '💎'}</span>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-500/50 font-black text-xs">R$</span>
                                <input 
                                  type="number" 
                                  value={pendingPrices[id] || ''} 
                                  onChange={e => handlePriceChange(id, e.target.value)} 
                                  className="w-36 bg-black border-2 border-zinc-800 rounded-2xl pl-10 pr-4 py-4 text-base text-gold-500 font-black focus:border-gold-500 outline-none shadow-inner text-white" 
                                  placeholder="0" 
                                />
                              </div>
                              <button 
                                onClick={() => toggleLock(id, type, num)}
                                disabled={isRes}
                                className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl transition-all shadow-xl border-2 ${isBlocked ? 'bg-red-600 text-white border-red-500' : 'bg-zinc-900 text-zinc-600 border-zinc-800 hover:text-white disabled:opacity-20'}`}
                              >
                                <i className={`fas fa-${isBlocked ? 'lock' : 'unlock'}`}></i>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={saveAllPrices} disabled={isSavingPrices} className="w-full mt-10 py-8 gold-gradient text-black font-black rounded-3xl shadow-2xl flex items-center justify-center gap-4 text-xl hover:scale-[1.02] transition-transform">
                      {isSavingPrices ? <i className="fas fa-spinner animate-spin"></i> : <><i className="fas fa-save"></i> SALVAR PREÇOS NO SISTEMA</>}
                    </button>
                  </div>
                ) : <div className="p-32 text-center text-zinc-900 font-black text-3xl select-none animate-pulse">ESCOLHA UM DIA PARA CONFIGURAR</div>}
              </div>

              <div className="lg:col-span-5 space-y-10">
                <section className="glass-card p-10 rounded-[3.5rem] border-zinc-800 shadow-2xl">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xs font-black text-gold-500 tracking-[0.3em]">FLYER DE DIVULGAÇÃO</h3>
                    <div className="text-right">
                      <p className="text-[8px] text-zinc-600 font-bold mb-1 tracking-widest">ÚLTIMA TROCA</p>
                      <p className="text-xs text-zinc-300 font-black tracking-tighter">{updateLogs.flyers || '--/--/----'}</p>
                    </div>
                  </div>
                  {currentDay && (
                    <div className="space-y-8">
                      <div className="aspect-[3/4] bg-zinc-900 rounded-[2.5rem] overflow-hidden border-4 border-zinc-800 flex items-center justify-center relative group shadow-2xl">
                        {pendingFlyer || flyers[currentDay] ? (
                          <img src={pendingFlyer || flyers[currentDay]} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        ) : (
                          <i className="fas fa-image text-zinc-800 text-7xl"></i>
                        )}
                        {pendingFlyer && <div className="absolute top-6 right-6 bg-gold-500 text-black px-5 py-2 rounded-full text-[10px] font-black animate-bounce shadow-2xl">NOVA PRÉVIA</div>}
                      </div>
                      
                      <div className="grid grid-cols-1 gap-4">
                        <label className="block w-full py-6 bg-zinc-800 text-zinc-300 text-center rounded-2xl cursor-pointer font-black text-[11px] border-2 border-zinc-700 hover:bg-zinc-700 transition-all uppercase tracking-widest">
                          <i className="fas fa-folder-open mr-3"></i> SELECIONAR NOVO FLYER
                          <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleFlyerPreview(currentDay!, e.target.files[0])} />
                        </label>
                        {pendingFlyer && (
                          <button onClick={saveFlyer} disabled={isSavingFlyer} className="w-full py-6 gold-gradient text-black font-black rounded-2xl shadow-2xl flex items-center justify-center gap-3 text-sm hover:scale-[1.02] transition-transform">
                            {isSavingFlyer ? <i className="fas fa-spinner animate-spin"></i> : <><i className="fas fa-check-circle"></i> ATUALIZAR FLYER NO SITE AGORA</>}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : (
            <div className="space-y-10 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="glass-card p-12 rounded-[3rem] border-gold-500/20 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                  <p className="text-[11px] text-zinc-500 font-black tracking-[0.3em] mb-4">FATURAMENTO TOTAL</p>
                  <p className="text-6xl font-serif gold-text font-black">R$ {totalRevenue.toLocaleString()}</p>
                </div>
                <div className="glass-card p-12 rounded-[3rem] border-white/5 shadow-2xl">
                  <p className="text-[11px] text-zinc-500 font-black tracking-[0.3em] mb-4">RESERVAS CONFIRMADAS</p>
                  <p className="text-6xl font-serif text-white font-black">{reservedList.length}</p>
                </div>
                <div className="glass-card p-12 rounded-[3rem] border-white/5 shadow-2xl">
                  <p className="text-[11px] text-zinc-500 font-black tracking-[0.3em] mb-4">PÚBLICO ESTIMADO</p>
                  <p className="text-6xl font-serif text-white font-black">{reservedList.reduce((acc, curr) => acc + (curr.customer?.guests.length || 0) + 1, 0)}</p>
                </div>
              </div>

              <div className="glass-card rounded-[3.5rem] overflow-hidden border-white/5 shadow-2xl">
                 <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                      <thead className="bg-zinc-900/90 text-[10px] font-black text-gold-500 tracking-[0.4em] uppercase">
                         <tr>
                            <th className="p-10">LOCAL / TIPO</th>
                            <th className="p-10">CLIENTE / CONTATO</th>
                            <th className="p-10">DIA / DATA</th>
                            <th className="p-10">VALOR PAGO</th>
                            <th className="p-10 text-center">AÇÕES</th>
                         </tr>
                      </thead>
                      <tbody className="text-xs font-bold text-zinc-400">
                         {reservedList.sort((a,b) => (b.customer?.timestamp || 0) - (a.customer?.timestamp || 0)).map(res => (
                           <tr key={res.id} className="border-t border-white/5 hover:bg-white/5 transition-colors group">
                              <td className="p-10">
                                 <div className="flex flex-col">
                                    <span className="text-[9px] text-zinc-600 font-black mb-1 tracking-widest">{res.type.toUpperCase()}</span>
                                    <span className="text-2xl font-black text-white group-hover:gold-text transition-colors">{res.number}</span>
                                 </div>
                              </td>
                              <td className="p-10">
                                 <div className="flex flex-col gap-1">
                                    <span className="text-base font-black text-white">{res.customer?.fullName}</span>
                                    <span className="text-[11px] text-green-500 font-black tracking-tighter flex items-center gap-2">
                                      <i className="fab fa-whatsapp text-lg"></i>{res.customer?.phone}
                                    </span>
                                    <span className="text-[9px] text-zinc-600 mt-1 uppercase">IDADE: {res.customer?.age} ANOS</span>
                                 </div>
                              </td>
                              <td className="p-10">
                                <div className="flex flex-col">
                                  <span className="text-sm font-black text-white uppercase">{res.day}</span>
                                  <span className="text-[9px] text-zinc-600 font-bold uppercase">{new Date(res.customer?.timestamp || 0).toLocaleDateString()}</span>
                                </div>
                              </td>
                              <td className="p-10">
                                <div className="flex flex-col">
                                  <span className="text-lg font-black text-gold-500">R$ {res.price}</span>
                                  <span className="text-[8px] text-zinc-700 font-black uppercase">CONFIRMADO VIA PIX</span>
                                </div>
                              </td>
                              <td className="p-10">
                                 <div className="flex justify-center gap-4">
                                    {res.customer?.receipt && (
                                      <button onClick={() => setViewingReceipt(res.customer?.receipt || null)} className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-gold-500 hover:bg-gold-500 hover:text-black transition-all border border-white/10 shadow-lg"><i className="fas fa-file-invoice text-xl"></i></button>
                                    )}
                                    <button onClick={async () => { if(confirm("DESEJA REALMENTE REMOVER ESTA RESERVA?")) await supabase?.from('reservations').delete().eq('id', res.id); }} className="w-14 h-14 rounded-2xl bg-red-600/10 text-red-500 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all border border-red-600/10 shadow-lg"><i className="fas fa-trash-alt text-xl"></i></button>
                                 </div>
                              </td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                 </div>
                 {reservedList.length === 0 && <div className="p-32 text-center text-zinc-800 font-black text-2xl select-none uppercase tracking-[0.5em]">NENHUMA VENDA REGISTRADA</div>}
              </div>
            </div>
          )}
        </main>
        
        {viewingReceipt && (
          <div className="fixed inset-0 z-[250] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-6" onClick={() => setViewingReceipt(null)}>
            <div className="relative max-w-2xl w-full animate-scale-up" onClick={e => e.stopPropagation()}>
              <img src={viewingReceipt} className="w-full h-auto rounded-[3.5rem] border-8 border-gold-500 shadow-[0_0_150px_rgba(212,175,55,0.4)]" alt="Comprovante" />
              <button onClick={() => setViewingReceipt(null)} className="absolute -top-6 -right-6 w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center shadow-2xl border-4 border-black"><i className="fas fa-times text-2xl"></i></button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* VISTA DO CLIENTE */
  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-gold-500 selection:text-black">
      <header className="py-24 text-center relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#d4af3715,transparent_75%)] opacity-60"></div>
        <h1 className="text-8xl md:text-[10rem] font-serif gold-text font-black tracking-tighter mb-4 relative z-10 select-none drop-shadow-2xl">BLACK NIGHT</h1>
        <p className="text-zinc-500 tracking-[1.2em] text-[11px] font-black relative z-10 uppercase opacity-80">PREMIUM LOUNGE EXPERIENCE</p>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-40">
        {!currentDay ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 animate-fade-in">
            {(['Sexta', 'Sábado'] as ReservationDay[]).map(day => (
              <button key={day} onClick={() => setCurrentDay(day)} className="group relative glass-card rounded-[5rem] overflow-hidden transition-all hover:scale-[1.03] h-[700px] border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
                {flyers[day] ? (
                  <img src={flyers[day]} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-1000" />
                ) : (
                  <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center text-zinc-800"><i className="fas fa-image text-7xl"></i></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                <div className="relative z-10 p-20 mt-auto text-left">
                  <span className="block text-gold-500 text-[11px] font-black mb-4 tracking-[0.5em] uppercase">{HOUSE_POLICIES[day].description}</span>
                  <span className="block text-8xl font-serif text-white group-hover:gold-text transition-colors font-black tracking-tighter uppercase">{day}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-12 animate-fade-in">
            <div className="flex justify-between items-end border-b border-white/5 pb-10">
              <div>
                <button onClick={() => setCurrentDay(null)} className="text-[11px] text-gold-500 font-black flex items-center gap-3 mb-4 tracking-[0.3em] uppercase group"><i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform"></i> VOLTAR PARA SELEÇÃO</button>
                <h2 className="text-7xl font-serif font-black tracking-tighter uppercase">{currentDay}</h2>
              </div>
            </div>
            <LoungeMap reservations={reservations} onSelect={handleSelectSpot} selectedId={selectedId} day={currentDay} prices={prices} />
          </div>
        )}
      </main>

      <footer className="py-24 border-t border-white/5 text-center bg-black/60 backdrop-blur-2xl relative mt-20">
         <div className="max-w-4xl mx-auto space-y-12">
            <div className="flex justify-center gap-12 opacity-30">
              <i className="fab fa-instagram text-3xl"></i>
              <i className="fab fa-facebook text-3xl"></i>
              <i className="fab fa-whatsapp text-3xl"></i>
            </div>
            <p className="text-[11px] text-zinc-800 font-black tracking-[0.8em] uppercase">© BLACK NIGHT LOUNGE - RESERVAS EXCLUSIVAS</p>
            
            <button 
              onClick={() => setView('admin_login')} 
              className="w-32 h-32 bg-zinc-900/30 text-zinc-800 hover:text-gold-500 transition-all duration-700 rounded-full flex items-center justify-center mx-auto border-2 border-zinc-900/50 hover:border-gold-500 group shadow-2xl hover:shadow-[0_0_80px_rgba(212,175,55,0.15)] mt-10"
              title="Acesso Admin"
            >
              <i className="fas fa-lock text-5xl opacity-20 group-hover:opacity-100 group-hover:scale-110 transition-transform"></i>
            </button>
         </div>
      </footer>

      {showForm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/96 backdrop-blur-2xl">
          <div className="glass-card w-full max-w-3xl p-16 rounded-[5rem] animate-scale-up border-gold-500/20 shadow-[0_0_150px_rgba(0,0,0,1)]">
            <h2 className="text-5xl font-serif gold-text font-black mb-12 uppercase tracking-tight">DADOS DA RESERVA</h2>
            <form onSubmit={e => { e.preventDefault(); if(parseInt(formData.age) < 18) return alert("ENTRADA PERMITIDA APENAS PARA MAIORES DE 18 ANOS."); setShowForm(false); setShowPayment(true); }} className="space-y-8">
              <input required type="text" placeholder="NOME COMPLETO DO TITULAR" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-6 text-base font-black focus:border-gold-500 outline-none uppercase tracking-wide text-white" />
              <div className="grid grid-cols-2 gap-6">
                <input required type="number" placeholder="IDADE" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-6 text-base font-black focus:border-gold-500 outline-none uppercase tracking-wide text-white" />
                <input required type="tel" placeholder="WHATSAPP (DDD)" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-6 text-base font-black focus:border-gold-500 outline-none uppercase tracking-wide text-white" />
              </div>
              <textarea placeholder="LISTA DE CONVIDADOS (UM POR LINHA)" value={formData.guests} onChange={e => setFormData({...formData, guests: e.target.value})} className="w-full h-40 bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-6 text-base font-black focus:border-gold-500 outline-none resize-none uppercase tracking-wide custom-scrollbar text-white"></textarea>
              <button type="submit" className="w-full py-8 gold-gradient text-black font-black rounded-[2.5rem] text-xl shadow-2xl uppercase tracking-widest hover:scale-[1.01] transition-transform">IR PARA O PAGAMENTO</button>
              <button type="button" onClick={() => setShowForm(false)} className="w-full text-zinc-700 font-black text-xs mt-2 tracking-[0.4em] uppercase hover:text-white transition-colors">CANCELAR RESERVA</button>
            </form>
          </div>
        </div>
      )}

      {showPayment && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/99 backdrop-blur-[50px]">
          <div className="glass-card w-full max-w-xl p-16 rounded-[5rem] text-center animate-scale-up border-gold-500 shadow-[0_0_150px_rgba(212,175,55,0.2)]">
            <h2 className="text-4xl font-serif gold-text font-black mb-10 uppercase tracking-tight">PAGAMENTO VIA PIX</h2>
            <div className="bg-zinc-950 p-10 rounded-[3.5rem] border-2 border-zinc-900 mb-10">
              <p className="text-white font-mono break-all text-xs opacity-60 mb-6 tracking-[0.2em]">{PIX_KEY}</p>
              <button onClick={() => { navigator.clipboard.writeText(PIX_KEY); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }} className="gold-gradient text-black px-12 py-4 rounded-full text-xs font-black uppercase shadow-2xl tracking-[0.2em]">
                {copyFeedback ? 'CHAVE COPIADA COM SUCESSO!' : 'COPIAR CHAVE PIX'}
              </button>
            </div>
            
            <div className="text-left space-y-4 mb-10">
               <label className="text-[11px] font-black text-zinc-500 ml-6 tracking-[0.4em] uppercase">ANEXAR COMPROVANTE (PDF/FOTO)</label>
               <input 
                required
                type="file" 
                accept="image/*,application/pdf" 
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} 
                className="w-full bg-black/60 border-2 border-zinc-900 rounded-[2.5rem] px-8 py-6 text-xs font-black text-zinc-400 file:mr-6 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-zinc-800 file:text-gold-500"
               />
               {!receiptFile && <p className="text-[10px] text-red-500 font-black ml-6 animate-pulse uppercase tracking-widest">* O ENVIO DO COMPROVANTE É OBRIGATÓRIO PARA VALIDAR A RESERVA</p>}
            </div>

            <button 
              onClick={handlePaymentFinish} 
              disabled={!receiptFile}
              className={`w-full py-8 font-black rounded-[2.5rem] text-xl shadow-2xl mb-6 transition-all uppercase tracking-[0.3em] ${receiptFile ? 'gold-gradient text-black hover:scale-[1.02]' : 'bg-zinc-900 text-zinc-700 cursor-not-allowed opacity-40'}`}
            >
              FINALIZAR AGORA
            </button>
            <button onClick={() => setShowPayment(false)} className="text-[11px] text-zinc-700 font-black uppercase tracking-[0.3em] hover:text-white transition-colors">VOLTAR E CORRIGIR DADOS</button>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-[130] bg-black flex items-center justify-center p-6 text-center">
          <div className="glass-card max-w-2xl w-full p-20 rounded-[6rem] space-y-10 animate-scale-up border-gold-500/50">
            <div className="w-32 h-32 gold-gradient rounded-full flex items-center justify-center mx-auto shadow-[0_0_100px_rgba(212,175,55,0.4)]">
              <i className="fas fa-check text-5xl text-black"></i>
            </div>
            <h1 className="text-5xl font-serif gold-text font-black uppercase tracking-tight">SOLICITAÇÃO ENVIADA!</h1>
            <p className="text-zinc-400 text-sm font-black leading-relaxed tracking-[0.2em] uppercase px-8">ESTAMOS VALIDANDO SEU COMPROVANTE. EM ALGUNS MINUTOS VOCÊ RECEBERÁ A CONFIRMAÇÃO NO WHATSAPP.</p>
            <button onClick={() => { setShowSuccess(false); setCurrentDay(null); }} className="w-full py-8 gold-gradient text-black font-black rounded-[3rem] uppercase text-base shadow-2xl tracking-[0.5em] hover:scale-[1.02] transition-transform">CONCLUIR</button>
          </div>
        </div>
      )}

      <ConciergeChat />
    </div>
  );
};

export default App;
