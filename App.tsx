
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
  const [updateLogs, setUpdateLogs] = useState<{ prices?: string }>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPrices, setIsSavingPrices] = useState(false);

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
        const u = configData.find(c => c.key === 'update_logs');
        if (p) { 
          setPrices(p.value || {}); 
          setPendingPrices(p.value || {}); 
        }
        if (u) setUpdateLogs(u.value || {});
      }

      const channel = supabase.channel('db-changes-v2')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, payload => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setReservations(prev => [...prev.filter(r => r.id !== payload.new.id), payload.new as Reservation]);
          } else if (payload.eventType === 'DELETE') {
            setReservations(prev => prev.filter(r => r.id !== payload.old.id));
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, payload => {
          const newData = payload.new as { key: string, value: any };
          if (newData.key === 'prices') { 
            setPrices(newData.value); 
            setPendingPrices(newData.value); 
          }
          if (newData.key === 'update_logs') setUpdateLogs(newData.value);
        })
        .subscribe();

      setIsLoading(false);
      return () => { supabase.removeChannel(channel); };
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
    
    // Busca o estado mais recente local
    const currentRes = reservations.find(r => r.id === id);
    
    try {
      if (currentRes?.status === 'blocked') {
        // Ação: DESBLOQUEAR
        const { error } = await supabase.from('reservations').delete().eq('id', id);
        if (error) throw error;
        
        // Atualização otimista
        setReservations(prev => prev.filter(r => r.id !== id));
      } else {
        // Ação: BLOQUEAR
        if (currentRes?.status === 'reserved') {
          alert("NÃO É POSSÍVEL BLOQUEAR UM LOCAL QUE JÁ FOI VENDIDO.");
          return;
        }

        const blockData = {
          id,
          day: currentDay,
          type,
          number: num,
          status: 'blocked',
          price: prices[id] || (type === ReservationType.VIP_BOOTH ? 1500 : 400)
        };

        const { error } = await supabase.from('reservations').upsert(blockData);
        if (error) throw error;
        
        // Atualização otimista
        setReservations(prev => {
          const filtered = prev.filter(r => r.id !== id);
          return [...filtered, blockData as Reservation];
        });
      }
    } catch (err) {
      console.error("Erro ao alternar trava:", err);
      alert("ERRO: NÃO FOI POSSÍVEL ALTERAR O STATUS NO BANCO DE DADOS.");
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
      alert("PREÇOS ATUALIZADOS COM SUCESSO!");
    } catch { alert("ERRO AO SALVAR PREÇOS NO SERVIDOR."); }
    finally { setIsSavingPrices(false); }
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

  if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center gold-text font-black text-4xl animate-pulse tracking-widest uppercase">Black Night</div>;

  if (view === 'admin_login') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="glass-card max-w-lg w-full p-16 rounded-[4rem] text-center border-gold-500/20 shadow-2xl animate-scale-up">
          <i className="fas fa-lock text-gold-500 text-5xl mb-10"></i>
          <h2 className="text-3xl font-serif gold-text font-black mb-10">ACESSO RESTRITO</h2>
          <form onSubmit={handleAdminLogin} className="space-y-6">
            <input type="text" placeholder="USUÁRIO" value={loginForm.user} onChange={e => setLoginForm({...loginForm, user: e.target.value})} className="w-full bg-black border-2 border-zinc-800 rounded-2xl px-8 py-5 font-black focus:border-gold-500 outline-none uppercase text-white" />
            <input type="password" placeholder="SENHA" value={loginForm.pass} onChange={e => setLoginForm({...loginForm, pass: e.target.value})} className="w-full bg-black border-2 border-zinc-800 rounded-2xl px-8 py-5 font-black focus:border-gold-500 outline-none text-white" />
            <button className="w-full py-6 gold-gradient text-black font-black rounded-2xl shadow-xl hover:scale-[1.02] transition-transform uppercase tracking-widest">ENTRAR NO PAINEL</button>
            <button type="button" onClick={() => setView('client')} className="text-zinc-600 font-black text-[10px] tracking-widest uppercase mt-4 hover:text-white transition-colors">VOLTAR AO SITE</button>
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
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-12 gap-8 border-b border-white/5 pb-8">
          <div>
            <h1 className="text-4xl font-serif gold-text font-black">BLACK PANEL</h1>
            <p className="text-[9px] text-zinc-500 tracking-[0.4em] font-black">CONTROLE DE OPERAÇÕES</p>
          </div>
          <div className="flex bg-zinc-900/50 p-2 rounded-2xl border border-white/5">
            <button onClick={() => setAdminTab('config')} className={`px-8 py-4 rounded-xl text-[10px] font-black transition-all ${adminTab === 'config' ? 'gold-gradient text-black shadow-lg' : 'text-zinc-500'}`}>MAPA & PREÇOS</button>
            <button onClick={() => setAdminTab('reports')} className={`px-8 py-4 rounded-xl text-[10px] font-black transition-all ${adminTab === 'reports' ? 'gold-gradient text-black shadow-lg' : 'text-zinc-500'}`}>VENDAS</button>
          </div>
          <button onClick={() => { localStorage.removeItem('bn_admin_auth'); setView('client'); }} className="px-8 py-3 bg-red-600/10 text-red-500 border border-red-600/20 rounded-xl font-black text-xs hover:bg-red-600 hover:text-white transition-all">LOGOUT</button>
        </header>

        <main className="max-w-7xl mx-auto">
          {adminTab === 'config' ? (
            <div className="max-w-4xl mx-auto space-y-10">
              <div className="flex gap-6">
                {(['Sexta', 'Sábado'] as ReservationDay[]).map(d => (
                  <button key={d} onClick={() => setCurrentDay(d)} className={`flex-1 py-10 rounded-[2.5rem] font-black text-xl transition-all shadow-2xl border-2 ${currentDay === d ? 'gold-gradient text-black border-gold-500' : 'bg-zinc-900/40 text-zinc-600 border-zinc-800/50 hover:border-zinc-700'}`}>{d}</button>
                ))}
              </div>
              
              {currentDay ? (
                <div className="glass-card p-10 rounded-[3.5rem] border-zinc-800 shadow-2xl relative overflow-hidden animate-fade-in">
                  <div className="flex justify-between items-center mb-10 border-b border-white/5 pb-6">
                    <h3 className="text-sm font-black text-gold-500 tracking-[0.3em]">GESTOR DE DISPONIBILIDADE ({currentDay})</h3>
                    <div className="text-right">
                      <p className="text-[8px] text-zinc-500 font-bold mb-1 tracking-widest uppercase">ÚLTIMA SINCRONIZAÇÃO</p>
                      <p className="text-xs text-zinc-300 font-black tracking-tighter">{updateLogs.prices || 'NÃO ATUALIZADO'}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4 max-h-[700px] overflow-y-auto custom-scrollbar pr-4">
                    {[...camarotes, ...mesas].map(({ id, num, type }) => {
                      const res = reservations.find(r => r.id === id);
                      const isBlocked = res?.status === 'blocked';
                      const isReserved = res?.status === 'reserved';
                      return (
                        <div key={id} className={`flex items-center justify-between p-6 rounded-3xl border-2 transition-all ${isReserved ? 'bg-gold-500/10 border-gold-500/40' : 'bg-black/40 border-zinc-900 hover:border-zinc-700'}`}>
                          <div>
                            <span className="text-[10px] text-zinc-600 font-black tracking-widest">{type.toUpperCase()}</span>
                            <p className="text-3xl font-black text-white">{num} {isReserved && '💎'}</p>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gold-500/30 text-xs font-black">R$</span>
                              <input 
                                type="number" 
                                value={pendingPrices[id] || ''} 
                                onChange={e => handlePriceChange(id, e.target.value)} 
                                className="w-36 bg-black border-2 border-zinc-800/50 rounded-2xl pl-10 pr-4 py-4 text-base text-gold-500 font-black focus:border-gold-500 outline-none text-white" 
                                placeholder="0" 
                              />
                            </div>
                            <button 
                              onClick={() => toggleLock(id, type, num)} 
                              disabled={isReserved} 
                              className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl transition-all shadow-xl border-2 ${isBlocked ? 'bg-red-600 text-white border-red-500 shadow-red-600/30' : 'bg-zinc-900 text-zinc-700 border-zinc-800 hover:text-white disabled:opacity-20'}`}
                              title={isBlocked ? "Remover Trava" : "Travar / Bloquear"}
                            >
                              <i className={`fas fa-${isBlocked ? 'lock' : 'unlock'}`}></i>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={saveAllPrices} disabled={isSavingPrices} className="w-full mt-10 py-8 gold-gradient text-black font-black rounded-[2.5rem] text-xl shadow-2xl hover:scale-[1.01] transition-transform uppercase tracking-widest">
                    {isSavingPrices ? <i className="fas fa-spinner animate-spin"></i> : <><i className="fas fa-save mr-2"></i> SALVAR PREÇOS</>}
                  </button>
                </div>
              ) : (
                <div className="p-40 text-center border-2 border-zinc-900/50 rounded-[4rem] bg-zinc-950/20">
                  <i className="fas fa-calendar-alt text-6xl text-zinc-900 mb-6"></i>
                  <p className="text-zinc-800 font-black text-3xl tracking-widest uppercase">SELECIONE O DIA PARA EDITAR</p>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card rounded-[3.5rem] overflow-hidden border-white/5 shadow-2xl animate-fade-in">
              <div className="p-10 border-b border-white/5 flex justify-between items-center">
                <h3 className="text-xl font-black text-white tracking-widest uppercase">RELATÓRIO DE VENDAS</h3>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 font-black uppercase">FATURAMENTO TOTAL</p>
                  <p className="text-3xl gold-text font-black">R$ {reservedList.reduce((a, b) => a + (b.price || 0), 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-zinc-950 text-[10px] font-black text-gold-500 tracking-widest uppercase">
                    <tr><th className="p-8">LOCAL</th><th className="p-8">CLIENTE / WHATSAPP</th><th className="p-8">DATA</th><th className="p-8">VALOR</th><th className="p-8">AÇÕES</th></tr>
                  </thead>
                  <tbody className="text-xs font-bold text-zinc-400">
                    {reservedList.sort((a,b) => (b.customer?.timestamp || 0) - (a.customer?.timestamp || 0)).map(res => (
                      <tr key={res.id} className="border-t border-white/5 hover:bg-white/5 transition-colors group">
                        <td className="p-8">
                          <span className="text-2xl font-black text-white block">{res.number}</span>
                          <span className="text-[8px] text-zinc-600 font-black">{res.type.toUpperCase()}</span>
                        </td>
                        <td className="p-8">
                          <p className="text-base font-black text-white mb-1 uppercase">{res.customer?.fullName}</p>
                          <p className="text-[11px] text-green-500 font-black"><i className="fab fa-whatsapp mr-1"></i>{res.customer?.phone}</p>
                        </td>
                        <td className="p-8">
                          <p className="font-black text-white uppercase">{res.day}</p>
                          <p className="text-[10px] text-zinc-600">{new Date(res.customer?.timestamp || 0).toLocaleDateString('pt-BR')}</p>
                        </td>
                        <td className="p-8 text-gold-500 font-black text-lg">R$ {res.price}</td>
                        <td className="p-8">
                          <div className="flex gap-4">
                            {res.customer?.receipt && <button onClick={() => setViewingReceipt(res.customer?.receipt || null)} className="w-12 h-12 bg-white/5 text-gold-500 rounded-2xl hover:bg-gold-500 hover:text-black transition-all shadow-lg border border-white/10" title="Ver Comprovante"><i className="fas fa-receipt text-lg"></i></button>}
                            <button onClick={async () => { if(confirm("EXCLUIR ESTA RESERVA?")) await supabase?.from('reservations').delete().eq('id', res.id); }} className="w-12 h-12 bg-red-600/10 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-lg border border-red-600/10" title="Excluir"><i className="fas fa-trash-alt text-lg"></i></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reservedList.length === 0 && <div className="p-40 text-center text-zinc-800 font-black text-2xl tracking-[0.5em] uppercase">NENHUMA VENDA REGISTRADA</div>}
            </div>
          )}
        </main>
        {viewingReceipt && (
          <div className="fixed inset-0 z-[250] bg-black/98 flex items-center justify-center p-6" onClick={() => setViewingReceipt(null)}>
            <div className="relative max-w-2xl w-full animate-scale-up" onClick={e => e.stopPropagation()}>
              <img src={viewingReceipt} className="w-full h-auto rounded-[3rem] border-4 border-gold-500 shadow-2xl" alt="Comprovante" />
              <button onClick={() => setViewingReceipt(null)} className="absolute -top-6 -right-6 w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center shadow-2xl border-4 border-black hover:scale-110 transition-transform"><i className="fas fa-times text-2xl"></i></button>
            </div>
          </div>
        )}
      </div>
    );
  }

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
              <button key={day} onClick={() => setCurrentDay(day)} className="group relative glass-card rounded-[5rem] overflow-hidden h-[600px] shadow-[0_40px_100px_rgba(0,0,0,0.6)] transition-all hover:scale-[1.02] border-white/5 border-2 hover:border-gold-500/20">
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/40 to-black"></div>
                <div className="relative z-10 p-20 h-full flex flex-col justify-center items-center text-center">
                  <i className={`fas ${day === 'Sexta' ? 'fa-music' : 'fa-crown'} text-7xl text-gold-500/10 mb-10 group-hover:scale-110 group-hover:text-gold-500/40 transition-all duration-700`}></i>
                  <span className="block text-gold-500 text-[12px] font-black mb-4 tracking-[0.5em] uppercase">{HOUSE_POLICIES[day].description}</span>
                  <span className="block text-9xl font-serif text-white group-hover:gold-text transition-all duration-500 font-black tracking-tighter uppercase">{day}</span>
                  <div className="mt-12 px-10 py-4 bg-white/5 rounded-full text-[10px] font-black tracking-[0.3em] uppercase opacity-40 group-hover:opacity-100 transition-all border border-white/5 group-hover:border-gold-500/30">CONSULTAR DISPONIBILIDADE</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-12 animate-fade-in">
            <div className="flex justify-between items-end border-b border-white/5 pb-10">
              <div>
                <button onClick={() => setCurrentDay(null)} className="text-[11px] text-gold-500 font-black flex items-center gap-3 mb-4 tracking-[0.3em] uppercase group hover:text-white transition-colors"><i className="fas fa-arrow-left group-hover:-translate-x-2 transition-transform"></i> VOLTAR PARA SELEÇÃO</button>
                <h2 className="text-8xl font-serif font-black tracking-tighter uppercase leading-none">{currentDay}</h2>
              </div>
            </div>
            <LoungeMap reservations={reservations} onSelect={handleSelectSpot} selectedId={selectedId} day={currentDay} prices={prices} />
          </div>
        )}
      </main>

      <footer className="py-24 border-t border-white/5 text-center bg-black/60 backdrop-blur-2xl relative mt-20">
         <p className="text-[11px] text-zinc-800 font-black tracking-[1em] uppercase mb-12">© BLACK NIGHT LOUNGE - RESERVAS EXCLUSIVAS</p>
         <button onClick={() => setView('admin_login')} className="w-24 h-24 bg-zinc-900/20 text-zinc-900 hover:text-gold-500 transition-all duration-700 rounded-full flex items-center justify-center mx-auto border border-zinc-900/50 hover:border-gold-500 group"><i className="fas fa-lock text-3xl opacity-10 group-hover:opacity-100 transition-transform"></i></button>
      </footer>

      {showForm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/96 backdrop-blur-2xl">
          <div className="glass-card w-full max-w-3xl p-16 rounded-[5rem] animate-scale-up border-gold-500/20 shadow-2xl">
            <h2 className="text-5xl font-serif gold-text font-black mb-12 uppercase tracking-tight leading-none">RESERVA PREMIUM</h2>
            <form onSubmit={e => { e.preventDefault(); if(parseInt(formData.age) < 18) return alert("SISTEMA PARA MAIORES DE 18 ANOS."); setShowForm(false); setShowPayment(true); }} className="space-y-8">
              <input required type="text" placeholder="NOME COMPLETO DO TITULAR" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-7 text-base font-black focus:border-gold-500 outline-none text-white uppercase tracking-widest" />
              <div className="grid grid-cols-2 gap-8">
                <input required type="number" placeholder="IDADE" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-7 text-base font-black focus:border-gold-500 outline-none text-white tracking-widest" />
                <input required type="tel" placeholder="WHATSAPP (DDD)" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-7 text-base font-black focus:border-gold-500 outline-none text-white tracking-widest" />
              </div>
              <textarea placeholder="LISTA DE CONVIDADOS (UM POR LINHA)" value={formData.guests} onChange={e => setFormData({...formData, guests: e.target.value})} className="w-full h-40 bg-black/40 border-2 border-zinc-900 rounded-3xl px-10 py-7 text-base font-black focus:border-gold-500 outline-none resize-none uppercase text-white tracking-widest custom-scrollbar"></textarea>
              <button type="submit" className="w-full py-8 gold-gradient text-black font-black rounded-[3rem] text-xl shadow-2xl uppercase tracking-[0.3em] hover:scale-[1.01] transition-transform">AVANÇAR PARA O PAGAMENTO</button>
              <button type="button" onClick={() => setShowForm(false)} className="w-full text-zinc-700 font-black text-xs mt-2 uppercase tracking-[0.5em] hover:text-white transition-colors">CANCELAR</button>
            </form>
          </div>
        </div>
      )}

      {showPayment && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/99 backdrop-blur-3xl">
          <div className="glass-card w-full max-w-xl p-16 rounded-[5rem] text-center border-gold-500 shadow-2xl animate-scale-up">
            <h2 className="text-4xl font-serif gold-text font-black mb-10 uppercase tracking-tight">CONFIRMAÇÃO VIA PIX</h2>
            <div className="bg-zinc-950 p-10 rounded-[3.5rem] border-2 border-zinc-900 mb-10">
              <p className="text-white font-mono break-all text-xs opacity-60 mb-8 tracking-[0.2em]">{PIX_KEY}</p>
              <button onClick={() => { navigator.clipboard.writeText(PIX_KEY); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }} className="gold-gradient text-black px-12 py-4 rounded-full text-xs font-black uppercase shadow-xl hover:scale-105 transition-transform tracking-widest">
                {copyFeedback ? 'CHAVE COPIADA!' : 'COPIAR CHAVE PIX'}
              </button>
            </div>
            <div className="text-left space-y-4 mb-10">
               <label className="text-[11px] font-black text-zinc-500 ml-6 uppercase tracking-[0.3em]">ANEXAR COMPROVANTE (OBRIGATÓRIO)</label>
               <input required type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="w-full bg-black border-2 border-zinc-900 rounded-[2.5rem] px-8 py-6 text-xs text-zinc-400 file:bg-zinc-800 file:text-gold-500 file:border-0 file:rounded-full file:px-6 file:py-2 file:mr-4 file:font-black file:uppercase" />
            </div>
            <button onClick={handlePaymentFinish} disabled={!receiptFile} className={`w-full py-8 font-black rounded-[2.5rem] text-xl shadow-2xl uppercase tracking-[0.4em] transition-all ${receiptFile ? 'gold-gradient text-black hover:scale-105' : 'bg-zinc-900 text-zinc-700 opacity-40 cursor-not-allowed'}`}>FINALIZAR RESERVA</button>
            <button onClick={() => setShowPayment(false)} className="text-[10px] text-zinc-700 font-black uppercase tracking-[0.3em] mt-6 hover:text-white transition-colors">VOLTAR</button>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-[130] bg-black flex items-center justify-center p-6 text-center">
          <div className="glass-card max-w-2xl w-full p-20 rounded-[6rem] space-y-10 border-gold-500/50 shadow-2xl animate-scale-up">
            <div className="w-32 h-32 gold-gradient rounded-full flex items-center justify-center mx-auto shadow-gold-500/20 shadow-2xl"><i className="fas fa-check text-5xl text-black"></i></div>
            <h1 className="text-6xl font-serif gold-text font-black uppercase tracking-tight">ENVIADO!</h1>
            <p className="text-zinc-400 text-sm font-black uppercase tracking-[0.2em] px-8 leading-relaxed">NOSSA EQUIPE IRÁ VALIDAR O PAGAMENTO E ENVIAR A CONFIRMAÇÃO NO SEU WHATSAPP EM INSTANTES.</p>
            <button onClick={() => { setShowSuccess(false); setCurrentDay(null); }} className="w-full py-8 gold-gradient text-black font-black rounded-[3rem] uppercase text-base shadow-2xl tracking-[0.5em] hover:scale-105 transition-transform">CONCLUIR</button>
          </div>
        </div>
      )}

      <ConciergeChat />
    </div>
  );
};

export default App;
