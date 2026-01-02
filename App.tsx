
import React, { useState, useEffect } from 'react';
import { Reservation, ReservationDay, ReservationType } from './types';
import { HOUSE_POLICIES, PIX_KEY } from './constants';
import LoungeMap from './components/LoungeMap';
import { supabase } from './services/supabase';

const ADMIN_USER = "BLACK";
const ADMIN_PASSWORD = "black979@@#";

const App: React.FC = () => {
  const [view, setView] = useState<'client' | 'admin_login' | 'admin_panel'>('client');
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' });
  const [currentDay, setCurrentDay] = useState<ReservationDay | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pendingPrices, setPendingPrices] = useState<Record<string, number>>({});
  const [flyers, setFlyers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPrices, setIsSavingPrices] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    birth: '',
    cpf: '',
    phone: '',
    guests: '',
    age: ''
  });

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
        if (p) {
          setPrices(p.value || {});
          setPendingPrices(p.value || {});
        }
        if (f) setFlyers(f.value || {});
      }

      supabase.channel('res-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, payload => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setReservations(prev => [...prev.filter(r => r.id !== payload.new.id), payload.new as Reservation]);
          } else if (payload.eventType === 'DELETE') {
            setReservations(prev => prev.filter(r => r.id !== payload.old.id));
          }
        }).subscribe();

      supabase.channel('config-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, payload => {
          const newData = payload.new as { key: string, value: any };
          if (newData.key === 'prices') {
            setPrices(newData.value);
            setPendingPrices(newData.value);
          }
          if (newData.key === 'flyers') setFlyers(newData.value);
        }).subscribe();

      setIsLoading(false);
    };

    init();
    
    if (localStorage.getItem('bn_admin_auth') === 'true') {
      setView('admin_panel');
    }
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Comparação robusta: usuário ignorando caixa e senha exata
    if (loginForm.user.trim().toUpperCase() === ADMIN_USER && loginForm.pass === ADMIN_PASSWORD) {
      localStorage.setItem('bn_admin_auth', 'true');
      setView('admin_panel');
      setLoginForm({ user: '', pass: '' });
    } else {
      alert("USUÁRIO OU SENHA INCORRETOS. VERIFIQUE SEUS DADOS.");
    }
  };

  const logoutAdmin = () => {
    localStorage.removeItem('bn_admin_auth');
    setView('client');
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const toggleBlockStatus = async (id: string) => {
    const existing = reservations.find(r => r.id === id);
    if (existing) {
      const newStatus = existing.status === 'blocked' ? 'available' : 'blocked';
      if (newStatus === 'available') {
        await supabase?.from('reservations').delete().eq('id', id);
        setReservations(prev => prev.filter(r => r.id !== id));
      } else {
        const updated = { ...existing, status: 'blocked' as const };
        await supabase?.from('reservations').upsert(updated);
      }
    } else {
      const parts = id.split('|');
      const newBlock = { id, day: parts[0], type: parts[1], number: parts[2], status: 'blocked', price: prices[id] || 0 };
      await supabase?.from('reservations').upsert(newBlock);
    }
  };

  const handlePriceChange = (id: string, value: string) => {
    setPendingPrices(prev => ({ ...prev, [id]: parseFloat(value) || 0 }));
  };

  const saveAllPrices = async () => {
    setIsSavingPrices(true);
    try {
      await supabase?.from('app_config').upsert({ key: 'prices', value: pendingPrices });
      setPrices(pendingPrices);
      alert("CONFIGURAÇÕES SALVAS COM SUCESSO!");
    } catch (err) {
      alert("ERRO AO SALVAR PREÇOS.");
    } finally {
      setIsSavingPrices(false);
    }
  };

  const handleFlyerUpload = async (day: ReservationDay, file: File) => {
    const base64 = await fileToBase64(file);
    const newFlyers = { ...flyers, [day]: base64 };
    setFlyers(newFlyers);
    await supabase?.from('app_config').upsert({ key: 'flyers', value: newFlyers });
  };

  const handlePaymentFinish = async () => {
    if (!selectedId || !currentDay) return;
    const receiptBase64 = receiptFile ? await fileToBase64(receiptFile) : '';
    const parts = selectedId.split('|');
    const finalPrice = prices[selectedId] || (parts[1] === ReservationType.VIP_BOOTH ? 1500 : 400);

    const newRes: Reservation = {
      id: selectedId,
      day: currentDay,
      type: parts[1] as ReservationType,
      number: parts[2],
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

    await supabase?.from('reservations').upsert(newRes);
    setShowPayment(false);
    setShowSuccess(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
        <div className="w-20 h-20 border-[6px] border-gold-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <p className="gold-text font-black tracking-[0.5em] text-xs">BLACK NIGHT EXPERIENCE</p>
      </div>
    );
  }

  if (view === 'admin_login') {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="glass-card max-w-lg w-full p-16 rounded-[4rem] text-center space-y-10 animate-scale-up border-white/10 shadow-[0_0_100px_rgba(212,175,55,0.05)]">
          <div className="w-24 h-24 bg-gold-500/10 rounded-full flex items-center justify-center mx-auto ring-2 ring-gold-500/20">
            <i className="fas fa-crown text-gold-500 text-4xl"></i>
          </div>
          <div>
            <h2 className="text-4xl font-serif gold-text font-black tracking-tight">BLACK ADMIN</h2>
            <p className="text-[11px] text-zinc-500 font-bold tracking-[0.3em] mt-3 uppercase opacity-60">ACESSO EXCLUSIVO À GESTÃO</p>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-6 text-left">
            <div className="space-y-3">
               <label className="text-[10px] font-black text-zinc-500 ml-6 tracking-[0.3em]">USUÁRIO</label>
               <input 
                autoFocus
                type="text" 
                placeholder="DIGITE BLACK" 
                value={loginForm.user}
                onChange={e => setLoginForm({...loginForm, user: e.target.value})}
                className="w-full bg-black/60 border-2 border-zinc-800 rounded-3xl px-8 py-5 font-black focus:border-gold-500 outline-none transition-all uppercase text-base placeholder:text-zinc-800"
              />
            </div>
            <div className="space-y-3">
               <label className="text-[10px] font-black text-zinc-500 ml-6 tracking-[0.3em]">SENHA</label>
               <input 
                type="password" 
                placeholder="••••••••" 
                value={loginForm.pass}
                onChange={e => setLoginForm({...loginForm, pass: e.target.value})}
                className="w-full bg-black/60 border-2 border-zinc-800 rounded-3xl px-8 py-5 font-black focus:border-gold-500 outline-none transition-all text-base placeholder:text-zinc-800"
              />
            </div>
            <button className="w-full py-6 gold-gradient text-black font-black rounded-3xl shadow-2xl hover:scale-[1.03] active:scale-95 transition-all mt-6 text-lg tracking-widest">
              ACESSAR PAINEL
            </button>
            <button type="button" onClick={() => setView('client')} className="w-full text-[11px] text-zinc-700 font-black hover:text-zinc-500 mt-4 transition-colors">CANCELAR ACESSO</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'admin_panel') {
    return (
      <div className="min-h-screen bg-[#050505] text-white p-6 md:p-16 uppercase tracking-tight">
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-16 gap-8 border-b border-white/5 pb-10">
          <div className="text-center md:text-left">
            <div className="flex items-center gap-4 justify-center md:justify-start mb-2">
              <i className="fas fa-crown text-gold-500 text-3xl"></i>
              <h1 className="text-5xl font-serif gold-text font-black">ADMIN DASHBOARD</h1>
            </div>
            <p className="text-[11px] text-zinc-500 font-bold tracking-[0.4em] uppercase">CONTROLE MASTER DE RESERVAS E VALORES</p>
          </div>
          <button onClick={logoutAdmin} className="w-full md:w-auto px-10 py-5 bg-red-600/10 text-red-500 border-2 border-red-600/20 rounded-2xl text-[12px] font-black hover:bg-red-600 hover:text-white transition-all shadow-xl active:scale-95">DESCONECTAR</button>
        </header>

        <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 pb-32">
          {/* COLUNA ESQUERDA: RESERVAS */}
          <div className="lg:col-span-7 space-y-10">
            <div className="flex gap-6">
              {(['Sexta', 'Sábado'] as ReservationDay[]).map(d => (
                <button key={d} onClick={() => setCurrentDay(d)} className={`flex-1 py-7 rounded-[2rem] text-[14px] font-black transition-all shadow-2xl active:scale-95 ${currentDay === d ? 'gold-gradient text-black' : 'bg-zinc-900/50 text-zinc-600 border border-zinc-800 hover:text-zinc-400'}`}>
                  {d}
                </button>
              ))}
            </div>

            {currentDay ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-8 px-4">
                  <h3 className="text-sm font-black text-gold-500 tracking-[0.3em]">RESERVAS DO DIA</h3>
                  <span className="text-[10px] bg-zinc-900 px-4 py-2 rounded-full text-zinc-500 font-black">TOTAL: {reservations.filter(r => r.day === currentDay && r.status === 'reserved').length}</span>
                </div>
                
                {reservations.filter(r => r.day === currentDay && r.status === 'reserved').length === 0 ? (
                  <div className="p-32 text-center glass-card rounded-[3rem] text-zinc-800 font-black border-dashed border-2 border-white/5 text-xl tracking-widest">
                    LISTA VAZIA
                  </div>
                ) : (
                  reservations.filter(r => r.day === currentDay && r.status === 'reserved').map(res => (
                    <div key={res.id} className="glass-card p-8 rounded-[2.5rem] border-l-[10px] border-gold-500 flex flex-col md:flex-row justify-between items-center gap-6 animate-fade-in shadow-2xl">
                      <div className="text-center md:text-left flex-1">
                        <div className="flex items-center gap-3 mb-3 justify-center md:justify-start">
                           <span className="text-[11px] bg-gold-500 text-black px-4 py-1.5 rounded-full font-black uppercase tracking-widest">{res.type} #{res.number}</span>
                           <span className="text-[10px] text-zinc-600 font-black">{new Date(res.customer?.timestamp || 0).toLocaleTimeString()}</span>
                        </div>
                        <h4 className="text-2xl font-black mb-1 text-white">{res.customer?.fullName}</h4>
                        <div className="flex flex-wrap gap-4 justify-center md:justify-start mt-2">
                           <p className="text-[11px] text-zinc-500 font-bold"><i className="fab fa-whatsapp text-green-600 mr-2"></i>{res.customer?.phone}</p>
                           <p className="text-[11px] text-zinc-500 font-bold"><i className="fas fa-users text-gold-500 mr-2"></i>{res.customer?.guests.length} CONVIDADOS</p>
                        </div>
                      </div>
                      <div className="flex gap-4 w-full md:w-auto">
                        {res.customer?.receipt && (
                          <button onClick={() => setViewingReceipt(res.customer?.receipt || null)} className="flex-1 md:flex-none w-16 h-16 bg-white/5 rounded-2xl hover:bg-gold-500/20 text-gold-500 transition-all border border-white/5 text-xl"><i className="fas fa-file-invoice"></i></button>
                        )}
                        <button onClick={async () => { if(confirm("DESEJA REALMENTE LIBERAR ESTE LOCAL?")) await supabase?.from('reservations').delete().eq('id', res.id); }} className="flex-1 md:flex-none w-16 h-16 bg-red-600/10 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all border border-red-600/10 text-xl"><i className="fas fa-trash"></i></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : <div className="p-40 text-center text-zinc-900 font-black text-3xl opacity-20 select-none">SELECIONE O DIA</div>}
          </div>

          {/* COLUNA DIREITA: CONFIGS */}
          <div className="lg:col-span-5 space-y-10">
            {/* GESTÃO DE VALORES COM BOTÃO SALVAR */}
            <section className="glass-card p-10 rounded-[3.5rem] border-zinc-800 shadow-2xl relative">
              <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
                <h3 className="text-xs font-black text-gold-500 tracking-[0.3em]">CONFIGURAR VALORES</h3>
                <i className="fas fa-coins text-zinc-800 text-xl"></i>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-4">
                {currentDay && [...Array(10)].map((_, i) => {
                  const num = (i+1).toString().padStart(2, '0');
                  const id = `${currentDay}|${ReservationType.VIP_BOOTH}|${num}`;
                  const isModified = pendingPrices[id] !== prices[id];
                  
                  return (
                    <div key={id} className={`flex items-center justify-between gap-6 py-4 px-6 rounded-2xl border transition-all ${isModified ? 'border-gold-500/50 bg-gold-500/5' : 'border-white/5 bg-black/20'}`}>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-zinc-500 mb-1">CAMAROTE</span>
                        <span className="text-xl font-black text-white">{num}</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] text-zinc-700 font-black">R$</span>
                          <input 
                            type="number" 
                            value={pendingPrices[id] ?? ""} 
                            onChange={(e) => handlePriceChange(id, e.target.value)} 
                            placeholder="1500" 
                            className="bg-black border-2 border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm w-32 text-gold-500 font-black outline-none focus:border-gold-500 transition-all text-center" 
                          />
                        </div>
                        <button onClick={() => toggleBlockStatus(id)} className={`w-14 h-14 rounded-xl text-[10px] font-black transition-all shadow-lg flex items-center justify-center ${reservations.find(r => r.id === id)?.status === 'blocked' ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-600 hover:text-white'}`}>
                          <i className={`fas ${reservations.find(r => r.id === id)?.status === 'blocked' ? 'fa-lock' : 'fa-unlock'}`}></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {currentDay && (
                <div className="mt-8">
                  <button 
                    onClick={saveAllPrices}
                    disabled={isSavingPrices}
                    className={`w-full py-6 rounded-2xl font-black tracking-[0.2em] transition-all shadow-2xl flex items-center justify-center gap-4 ${isSavingPrices ? 'bg-zinc-800 text-zinc-600' : 'gold-gradient text-black hover:scale-[1.02] active:scale-95'}`}
                  >
                    {isSavingPrices ? (
                      <i className="fas fa-circle-notch animate-spin"></i>
                    ) : (
                      <>
                        <i className="fas fa-save"></i>
                        SALVAR CONFIGURAÇÕES DE VALORES
                      </>
                    )}
                  </button>
                  <p className="text-[9px] text-zinc-600 text-center font-black mt-4 tracking-widest uppercase">AS ALTERAÇÕES SÓ SERÃO APLICADAS AO CLICAR EM SALVAR</p>
                </div>
              )}
            </section>

            {/* FLYER */}
            <section className="glass-card p-10 rounded-[3.5rem] border-zinc-800 shadow-2xl">
              <h3 className="text-xs font-black text-gold-500 tracking-[0.3em] mb-8 border-b border-white/5 pb-6">FLYER PUBLICITÁRIO</h3>
              {currentDay ? (
                <div className="space-y-6">
                   <div className="aspect-[3/4] bg-zinc-900 rounded-[2.5rem] overflow-hidden border-2 border-zinc-800 flex items-center justify-center group relative shadow-inner">
                     {flyers[currentDay] ? (
                       <img src={flyers[currentDay]} className="w-full h-full object-cover" />
                     ) : (
                       <i className="fas fa-image text-5xl text-zinc-800"></i>
                     )}
                     <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center p-10 text-center">
                        <span className="text-xs font-black text-white tracking-[0.2em] leading-relaxed">CLIQUE NO BOTÃO ABAIXO PARA CARREGAR UMA NOVA IMAGEM</span>
                     </div>
                   </div>
                   <label className="block w-full py-6 gold-gradient text-black text-center rounded-[2rem] cursor-pointer transition-all hover:scale-[1.02] active:scale-95 shadow-xl font-black tracking-widest text-sm">
                     <i className="fas fa-upload mr-3"></i> CARREGAR NOVO FLYER
                     <input type="file" className="hidden" accept="image/*" onChange={e => { if(e.target.files?.[0]) handleFlyerUpload(currentDay!, e.target.files[0]) }} />
                   </label>
                </div>
              ) : <p className="text-[10px] text-zinc-800 font-black text-center py-20">AGUARDANDO SELEÇÃO DE DIA...</p>}
            </section>
          </div>
        </main>

        {viewingReceipt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/98 backdrop-blur-md" onClick={() => setViewingReceipt(null)}>
            <div className="relative max-w-2xl w-full animate-scale-up" onClick={e => e.stopPropagation()}>
              <img src={viewingReceipt} className="w-full h-auto rounded-[3rem] shadow-[0_0_100px_rgba(212,175,55,0.2)] border-2 border-white/10" alt="Recibo" />
              <button onClick={() => setViewingReceipt(null)} className="absolute -top-6 -right-6 w-16 h-16 bg-gold-500 text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform"><i className="fas fa-times text-2xl"></i></button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // VISTA DO CLIENTE
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 uppercase tracking-tight selection:bg-gold-500 selection:text-black flex flex-col">
      <header className="py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#d4af3711,transparent_70%)]"></div>
        <h1 className="text-8xl md:text-[10rem] font-serif gold-text tracking-tighter mb-4 font-black select-none leading-none">BLACK NIGHT</h1>
        <p className="text-zinc-600 tracking-[1em] text-[11px] font-black opacity-80 mt-6">PREMIUM LOUNGE EXPERIENCE</p>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-24 flex-1 w-full">
        {!currentDay ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 animate-fade-in">
            {(['Sexta', 'Sábado'] as ReservationDay[]).map((day) => (
              <button key={day} onClick={() => setCurrentDay(day)} className="group relative glass-card rounded-[4rem] overflow-hidden transition-all hover:scale-[1.02] h-[650px] border-zinc-900 shadow-2xl">
                {flyers[day] ? (
                  <img src={flyers[day]} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-1000" />
                ) : (
                  <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center"><i className="fas fa-image text-zinc-800 text-6xl"></i></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent"></div>
                <div className="relative z-10 p-16 mt-auto text-left">
                  <span className="block text-gold-500 text-[11px] font-black mb-4 tracking-[0.5em]">{HOUSE_POLICIES[day].description}</span>
                  <span className="block text-7xl font-serif text-white group-hover:gold-text transition-colors font-black tracking-tighter">{day}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-12 animate-fade-in">
            <div className="flex justify-between items-end border-b border-white/5 pb-12">
              <div>
                <button onClick={() => setCurrentDay(null)} className="text-[11px] text-gold-500 font-black flex items-center gap-3 mb-4 hover:underline tracking-widest"><i className="fas fa-arrow-left text-[9px]"></i> VOLTAR AO INÍCIO</button>
                <h2 className="text-7xl font-serif text-white font-black tracking-tighter">{currentDay}</h2>
              </div>
              <div className="text-right hidden md:block">
                <p className="text-[11px] text-zinc-500 font-black tracking-[0.4em] mb-2 uppercase">MAPA DE ACESSO</p>
                <p className="text-gold-500 text-sm font-black tracking-widest uppercase">SELECIONE SEU CAMAROTE</p>
              </div>
            </div>
            <LoungeMap reservations={reservations} onSelect={(id) => { setSelectedId(id); setShowForm(true); }} selectedId={selectedId} day={currentDay} prices={prices} />
          </div>
        )}
      </main>

      <footer className="py-16 px-6 border-t border-white/5 text-center bg-black/50 backdrop-blur-md">
         <p className="text-[9px] text-zinc-800 font-black tracking-[0.8em] mb-6 uppercase">© BLACK NIGHT LOUNGE - TODOS OS DIREITOS RESERVADOS</p>
         <button 
           onClick={() => setView('admin_login')} 
           className="w-12 h-12 inline-flex items-center justify-center text-zinc-600 hover:text-gold-500 transition-all duration-700 rounded-full hover:bg-white/5"
           title="Acesso Administrador"
         >
            <i className="fas fa-lock text-[16px] opacity-40 hover:opacity-100"></i>
         </button>
      </footer>

      {/* MODAIS DE FLUXO DO CLIENTE */}
      {showForm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl">
          <div className="glass-card w-full max-w-3xl p-16 rounded-[4rem] animate-scale-up border-gold-500/30 shadow-[0_0_100px_rgba(212,175,55,0.1)]">
            <div className="flex justify-between items-start mb-12">
              <h2 className="text-5xl font-serif gold-text font-black uppercase leading-[0.8]">RESERVA<br/><span className="text-3xl text-white opacity-30">{selectedId?.split('|').slice(1).join(' #')}</span></h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white transition-colors"><i className="fas fa-times text-2xl"></i></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if(parseInt(formData.age) < 18) return alert("ENTRADA PERMITIDA APENAS PARA +18 ANOS."); setShowForm(false); setShowPayment(true); }} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2">
                <input required type="text" placeholder="NOME COMPLETO" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-black/50 border-2 border-zinc-900 rounded-3xl px-8 py-6 text-base font-black focus:border-gold-500 outline-none transition-all placeholder:text-zinc-800" />
              </div>
              <input required type="number" placeholder="IDADE" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="w-full bg-black/50 border-2 border-zinc-900 rounded-3xl px-8 py-6 text-base font-black focus:border-gold-500 outline-none placeholder:text-zinc-800" />
              <input required type="tel" placeholder="WHATSAPP" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-black/50 border-2 border-zinc-900 rounded-3xl px-8 py-6 text-base font-black focus:border-gold-500 outline-none placeholder:text-zinc-800" />
              <div className="md:col-span-2">
                <textarea placeholder="LISTA DE CONVIDADOS (UM POR LINHA)" value={formData.guests} onChange={e => setFormData({...formData, guests: e.target.value})} className="w-full h-40 bg-black/50 border-2 border-zinc-900 rounded-[2rem] px-8 py-6 text-base font-black focus:border-gold-500 outline-none resize-none placeholder:text-zinc-800"></textarea>
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="w-full py-7 gold-gradient text-black font-black text-xl tracking-[0.3em] rounded-3xl shadow-2xl hover:scale-[1.02] active:scale-95 transition-all uppercase">PRÓXIMO PASSO</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPayment && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/98 backdrop-blur-3xl">
          <div className="glass-card w-full max-w-xl p-16 rounded-[4rem] text-center animate-scale-up border-gold-500 shadow-[0_0_100px_rgba(212,175,55,0.2)]">
            <h2 className="text-4xl font-serif gold-text font-black mb-10 tracking-tight">PAGAMENTO PIX</h2>
            <div className="bg-zinc-950 p-10 rounded-[3rem] border-2 border-zinc-900 mb-10 relative group">
              <p className="text-white font-mono break-all text-xs tracking-[0.2em] leading-relaxed opacity-80">{PIX_KEY}</p>
              <button onClick={() => { navigator.clipboard.writeText(PIX_KEY); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }} className="absolute -bottom-5 left-1/2 -translate-x-1/2 gold-gradient text-black px-8 py-3 rounded-full text-[10px] font-black shadow-2xl hover:scale-105 transition-transform tracking-widest uppercase">
                {copyFeedback ? 'COPIADO COM SUCESSO' : 'COPIAR CHAVE PIX'}
              </button>
            </div>
            <div className="space-y-8">
              <div className="text-left space-y-3">
                <p className="text-[11px] text-zinc-500 font-black mb-2 tracking-[0.3em] uppercase ml-4">ANEXAR COMPROVANTE</p>
                <input type="file" accept="image/*" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="w-full bg-zinc-950 border-2 border-zinc-900 rounded-[2rem] px-6 py-5 text-[11px] font-black text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-zinc-800 file:text-zinc-400" />
              </div>
              <button onClick={handlePaymentFinish} className="w-full py-7 gold-gradient text-black font-black text-xl tracking-[0.3em] rounded-3xl uppercase shadow-2xl hover:scale-[1.02] active:scale-95 transition-all">CONCLUIR MINHA RESERVA</button>
              <button onClick={() => setShowPayment(false)} className="text-[11px] text-zinc-700 font-black uppercase hover:text-white transition-colors tracking-widest">VOLTAR E REVISAR</button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-[130] bg-[#050505] flex items-center justify-center p-6 text-center">
          <div className="glass-card max-w-lg w-full p-16 rounded-[4.5rem] space-y-10 animate-scale-up border-gold-500/50 shadow-[0_0_150px_rgba(212,175,55,0.1)]">
            <div className="w-28 h-28 gold-gradient rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(212,175,55,0.3)]">
              <i className="fas fa-check text-5xl text-black"></i>
            </div>
            <div>
              <h1 className="text-5xl font-serif gold-text font-black mb-4 uppercase tracking-tight leading-none">RESERVA<br/>SOLICITADA!</h1>
              <p className="text-zinc-500 text-[11px] font-black leading-relaxed uppercase tracking-[0.2em] px-4">ESTAMOS CONFERINDO SEU PAGAMENTO.<br/>VOCÊ SERÁ NOTIFICADO NO WHATSAPP<br/>ASSIM QUE TUDO FOR CONFIRMADO.</p>
            </div>
            <button onClick={() => { setShowSuccess(false); setCurrentDay(null); }} className="w-full py-6 gold-gradient text-black font-black rounded-3xl tracking-[0.3em] shadow-2xl uppercase text-base hover:scale-[1.03] transition-all">FINALIZAR ACESSO</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
