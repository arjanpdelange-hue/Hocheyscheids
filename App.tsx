import React, { useState, useEffect, useRef } from 'react';
import { TeamId, CardType, ActiveCard, TimelineEvent, MatchConfig } from './types';
import { DEFAULT_QUARTER_DURATION, DEFAULT_QUARTER_COUNT, CARD_CONFIG, QUARTER_NAMES } from './constants';
import { playBeep } from './utils/sound';
import { FieldTracker } from './components/FieldTracker';

// Hockey Stick Icon Component
const HockeyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M9.5 2C9.5 2 9.5 15 9.5 16.5C9.5 19 11 21.5 14 21.5C16.5 21.5 18 19.5 18 19.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="19" cy="21" r="1.5" fill="currentColor" />
  </svg>
);

// Share Icon Component
const ShareIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M15.75 4.5a3 3 0 11.825 2.066l-8.421 4.679a3.002 3.002 0 010 1.51l8.421 4.679a3 3 0 11-.729 1.31l-8.421-4.678a3 3 0 110-4.132l8.421-4.679a3 3 0 01-.096-.755z" clipRule="evenodd" />
  </svg>
);

function App() {
  // --- STATE ---
  const [matchConfig, setMatchConfig] = useState<MatchConfig>({
    quarterCount: DEFAULT_QUARTER_COUNT,
    quarterDurationSeconds: DEFAULT_QUARTER_DURATION
  });

  const [time, setTime] = useState(DEFAULT_QUARTER_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [quarter, setQuarter] = useState(1);
  const [isMatchFinished, setIsMatchFinished] = useState(false);
  
  // Key used to force-reset the FieldTracker component state
  const [fieldTrackerKey, setFieldTrackerKey] = useState(0);
  
  // Double click logic
  const lastClickRef = useRef<number>(0);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Timer Reference for robust background timing
  const lastTickRef = useRef<number>(0);
  
  // Break & Pause Timer References
  const breakStartTimeRef = useRef<number | null>(null);
  const pauseStartTimeRef = useRef<number | null>(null);

  // Silent Audio Ref for Background Execution
  const silentAudioRef = useRef<HTMLAudioElement>(null);

  const [teams, setTeams] = useState({
    home: { name: 'BMHV', score: 0, color: '#800000', textColorClass: 'text-[#800000]' },
    away: { name: 'Gastteam', score: 0, color: '#3b82f6', textColorClass: 'text-blue-600' }
  });

  const [activeCards, setActiveCards] = useState<ActiveCard[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  
  // Modal States
  const [showConfig, setShowConfig] = useState(false);
  const [modalData, setModalData] = useState<{ title: string; message: string; onConfirm?: () => void } | null>(null);
  
  // Input Modal State
  const [inputModal, setInputModal] = useState<{ type: 'goal' | 'card'; team: TeamId; subType: string; } | null>(null);
  const [inputNumber, setInputNumber] = useState('');
  const [goalType, setGoalType] = useState<'Velddoelpunt' | 'Strafcorner' | 'Strafbal'>('Velddoelpunt');

  // --- WAKE LOCK & BACKGROUND HANDLER ---
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('Wake Lock active');
        } catch (err) {
          console.error('Wake Lock failed:', err);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRunning) {
        requestWakeLock();
      }
    };

    if (isRunning) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Start silent audio to keep CPU alive in background
      if (silentAudioRef.current) {
        silentAudioRef.current.play().catch(e => console.warn("Audio autoplay prevented", e));
      }
    } else {
      // Pause silent audio
      if (silentAudioRef.current) {
        silentAudioRef.current.pause();
      }
    }

    return () => {
      if (wakeLock) {
        wakeLock.release();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRunning]);

  // --- HELPERS ---
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const logEvent = (description: string, type: TimelineEvent['type'], team?: TeamId, rugnummer?: string) => {
    // BEREKEN CUMULATIEVE TIJD (DOORLOPENDE TIJD)
    // time is the remaining time in the current quarter
    const elapsedInCurrentQuarter = matchConfig.quarterDurationSeconds - time;
    const previousQuartersSeconds = (quarter - 1) * matchConfig.quarterDurationSeconds;
    const totalElapsedSeconds = previousQuartersSeconds + elapsedInCurrentQuarter;
    
    const timeDisplay = formatTime(totalElapsedSeconds);
    
    setTimeline(prev => [{
      id: Date.now(),
      timestamp: Date.now(),
      quarter,
      timeDisplay, 
      description,
      type,
      team,
      rugnummer
    }, ...prev]);
  };

  // --- ROBUST TIMING LOGIC ---
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isRunning) {
      // Set initial timestamp when starting/resuming
      lastTickRef.current = Date.now();

      interval = setInterval(() => {
        const now = Date.now();
        const deltaMs = now - lastTickRef.current;

        // Only update if at least 1 second has passed (avoids micro-updates)
        if (deltaMs >= 1000) {
          const deltaSeconds = Math.floor(deltaMs / 1000);
          
          // Advance the ref by the processed seconds
          lastTickRef.current += deltaSeconds * 1000;

          // Update Match Timer
          setTime((prevTime) => {
            const newTime = Math.max(0, prevTime - deltaSeconds);
            
            // 2 Minute Warning Check
            if (prevTime > 120 && newTime <= 120) {
              playBeep(880, 200, 2);
              logEvent('2-Minuten Waarschuwing', 'general');
            }
            return newTime;
          });

          // Update Cards
          setActiveCards((prevCards) => {
            const updatedCards = prevCards.map(card => {
              if (card.timeRemaining > 0 && card.type !== 'rood') {
                const newTime = Math.max(0, card.timeRemaining - deltaSeconds);
                return { ...card, timeRemaining: newTime };
              }
              return card;
            });

            // Check for expired cards after update to log correctly
            prevCards.forEach((oldCard, index) => {
               const newCard = updatedCards[index];
               if (oldCard.timeRemaining > 0 && newCard.timeRemaining === 0 && oldCard.type !== 'rood') {
                  playBeep(600, 1000, 1);
                  // Log event immediately using the helper which calculates current match time
                  logEvent(`${CARD_CONFIG[oldCard.type].label} kaart afgelopen voor ${teams[oldCard.team].name} (Nr. ${oldCard.rugnummer})`, 'general', oldCard.team, oldCard.rugnummer);
               }
            });

            return updatedCards;
          });
        }
      }, 200); // Check frequently
    }

    return () => clearInterval(interval);
  }, [isRunning, teams, matchConfig, quarter, time]); // Added dependencies for logEvent to have correct state

  // --- STOP CONDITION CHECK ---
  useEffect(() => {
    if (time === 0 && isRunning) {
      setIsRunning(false);
      playBeep(440, 500, 3); 
      
      // EINDE KWART: Voeg tijdstip toe
      const now = new Date();
      const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      // Log event handmatig om 'quarter' correct te houden voordat we incrementen
      logEvent(`Einde ${QUARTER_NAMES[quarter]} (${timeString})`, 'end');
      
      // Start break timer
      breakStartTimeRef.current = Date.now();
      pauseStartTimeRef.current = null;
      
      if (quarter >= matchConfig.quarterCount) {
        setIsMatchFinished(true);
        setModalData({ title: 'Wedstrijd Afgelopen', message: 'De wedstrijd is voorbij. Je kunt de tijdlijn delen.' });
      } else {
        setModalData({ title: 'Einde Kwart', message: `${QUARTER_NAMES[quarter]} is afgelopen.` });
      }
    }
  }, [time, isRunning, quarter, matchConfig]);

  // --- HANDLERS ---
  const handleStartPause = () => {
    if (isMatchFinished) return;

    // START NIEUW KWART (Als tijd 0 is en niet laatste kwart)
    if (time === 0 && quarter < matchConfig.quarterCount) {
      
      // 1. Bereken en log Rusttijd
      if (breakStartTimeRef.current) {
          const breakDurationMs = Date.now() - breakStartTimeRef.current;
          const breakSeconds = Math.floor(breakDurationMs / 1000);
          const breakMin = Math.floor(breakSeconds / 60);
          const breakSec = breakSeconds % 60;
          const breakString = `${breakMin}:${breakSec.toString().padStart(2, '0')}`;
          
          // Handmatig toevoegen aan tijdlijn om de tijd van het VORIGE kwart te gebruiken (einde)
          const prevQSeconds = quarter * matchConfig.quarterDurationSeconds; 
          const timeDisplay = formatTime(prevQSeconds);

          setTimeline(prev => [{
            id: Date.now(),
            timestamp: Date.now(),
            quarter: quarter,
            timeDisplay: timeDisplay,
            description: `Rusttijd: ${breakString}`,
            type: 'general'
          }, ...prev]);
          
          breakStartTimeRef.current = null;
      }

      // 2. Zet kwart klaar
      setQuarter(q => q + 1);
      setTime(matchConfig.quarterDurationSeconds);
      setIsRunning(true);
      
      // Audio starten voor background
      if (silentAudioRef.current) {
        silentAudioRef.current.play().catch(e => console.warn("Audio autoplay prevented", e));
      }
      
      setTimeout(() => {
          const newQuarterIdx = quarter + 1;
          const elapsedSeconds = (newQuarterIdx - 1) * matchConfig.quarterDurationSeconds;
          const displayTime = formatTime(elapsedSeconds);
          
          setTimeline(prev => [{
              id: Date.now(),
              timestamp: Date.now(),
              quarter: newQuarterIdx,
              timeDisplay: displayTime,
              description: `Start ${QUARTER_NAMES[newQuarterIdx]}`,
              type: 'start'
          }, ...prev]);
      }, 50);
      
      return;
    }

    if (!isRunning) {
      // HERVATTEN / STARTEN
      setIsRunning(true);
      
      // Forceer audio start
      if (silentAudioRef.current) silentAudioRef.current.play().catch(() => {});

      if (time === matchConfig.quarterDurationSeconds) {
         // START WEDSTRIJD (KWART 1)
         if (quarter === 1) {
             const now = new Date();
             const dateStr = now.toLocaleDateString('nl-NL');
             const timeStr = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
             logEvent(`Start wedstrijd: ${dateStr} om ${timeStr}`, 'start');
         } else {
             logEvent(`Start ${QUARTER_NAMES[quarter]}`, 'start');
         }
      } else {
         // HERVATTEN NA PAUZE
         let resumeText = 'Wedstrijd Hervat';
         if (pauseStartTimeRef.current) {
             const pauseDurationMs = Date.now() - pauseStartTimeRef.current;
             const pSeconds = Math.floor(pauseDurationMs / 1000);
             const pMin = Math.floor(pSeconds / 60);
             const pSec = pSeconds % 60;
             const pString = `${pMin}:${pSec.toString().padStart(2, '0')}`;
             
             resumeText += ` (Pauze: ${pString})`;
             pauseStartTimeRef.current = null;
         }
         logEvent(resumeText, 'start');
      }
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    } else {
      // PAUZEREN (Dubbelklik Logic)
      const now = Date.now();
      if (now - lastClickRef.current < 300) {
        setIsRunning(false);
        pauseStartTimeRef.current = Date.now();
        if (silentAudioRef.current) silentAudioRef.current.pause();
        if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
        logEvent('Wedstrijd Gepauzeerd', 'pause');
      } else {
        lastClickRef.current = now;
        clickTimeoutRef.current = setTimeout(() => {}, 300);
      }
    }
  };

  const handleTeamNameChange = (team: TeamId, newName: string) => {
    setTeams(prev => ({ ...prev, [team]: { ...prev[team], name: newName } }));
  };

  const prepareInputEvent = (type: 'goal' | 'card', team: TeamId, subType: string) => {
    setInputModal({ type, team, subType });
    setInputNumber('');
    setGoalType('Velddoelpunt'); // Default goal type
  };

  const confirmInputEvent = () => {
    if (!inputModal) return;
    const { type, team, subType } = inputModal;
    const num = inputNumber.trim() || '?';

    if (type === 'goal') {
      setTeams(prev => ({ ...prev, [team]: { ...prev[team], score: prev[team].score + 1 } }));
      logEvent(`Doelpunt ${teams[team].name} (${goalType})`, 'goal', team, num);
    } else if (type === 'card') {
      const cardType = subType as CardType;
      const newCard: ActiveCard = {
        id: Date.now(),
        team,
        type: cardType,
        timeRemaining: CARD_CONFIG[cardType].duration,
        rugnummer: num
      };
      setActiveCards(prev => [...prev, newCard]);
      logEvent(`${CARD_CONFIG[cardType].label} kaart voor ${teams[team].name}`, 'card', team, num);
    }

    setInputModal(null);
  };

  const undoLastAction = () => {
    const lastRelevant = timeline.find(e => e.type === 'goal' || e.type === 'card');
    if (!lastRelevant) return;

    setModalData({
      title: 'Ongedaan Maken',
      message: `Weet je zeker dat je "${lastRelevant.description}" ongedaan wilt maken?`,
      onConfirm: () => {
        if (lastRelevant.type === 'goal' && lastRelevant.team) {
          setTeams(prev => ({ ...prev, [lastRelevant.team!]: { ...prev[lastRelevant.team!], score: Math.max(0, prev[lastRelevant.team!].score - 1) } }));
        } else if (lastRelevant.type === 'card' && lastRelevant.team) {
           setActiveCards(prev => {
             const idx = prev.findIndex(c => c.rugnummer === lastRelevant.rugnummer && lastRelevant.description.includes(CARD_CONFIG[c.type].label));
             if (idx > -1) {
               const newCards = [...prev];
               newCards.splice(idx, 1);
               return newCards;
             }
             return prev;
           });
        }
        setTimeline(prev => prev.filter(e => e.id !== lastRelevant.id));
        setModalData(null);
      }
    });
  };

  const shareTimeline = async () => {
    const text = `Wedstrijdverslag: ${teams.home.name} vs ${teams.away.name}\nUitslag: ${teams.home.score} - ${teams.away.score}\n\nTijdlijn:\n${timeline.map(e => `[${e.timeDisplay}] ${e.description} ${e.rugnummer ? `(Nr. ${e.rugnummer})` : ''}`).join('\n')}`;
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Hockey Wedstrijdverslag', text });
      } catch (err) { console.error(err); }
    } else {
      await navigator.clipboard.writeText(text);
      alert('Tijdlijn gekopieerd naar klembord!');
    }
  };

  const resetMatch = () => {
    setIsRunning(false);
    if (silentAudioRef.current) silentAudioRef.current.pause();
    setTime(matchConfig.quarterDurationSeconds);
    setQuarter(1);
    setTeams(prev => ({
      home: { ...prev.home, score: 0 },
      away: { ...prev.away, score: 0 }
    }));
    setActiveCards([]);
    setTimeline([]);
    setIsMatchFinished(false);
    setModalData(null);
    setFieldTrackerKey(prev => prev + 1);
    breakStartTimeRef.current = null;
    pauseStartTimeRef.current = null;
  };

  // --- RENDER COMPONENTS ---

  return (
    <div className="min-h-screen pb-20 max-w-2xl mx-auto bg-gray-50 shadow-2xl overflow-hidden flex flex-col">
      
      {/* HIDDEN AUDIO ELEMENT FOR BACKGROUND EXECUTION */}
      <audio ref={silentAudioRef} loop playsInline>
        <source src="data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABpTUoxLjAwLjAwIC0gQWJvdmUgYWxsLCBjcmVhdGUgdGhlIHNvdW5kM//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" type="audio/mpeg" />
      </audio>

      {/* --- HEADER --- */}
      <header className="bg-indigo-600 text-white p-4 shadow-md z-10 flex items-center justify-center">
        <h1 className="text-xl font-bold tracking-wide">Veldhockey Arbitrage</h1>
      </header>

      {/* --- SCOREBOARD --- */}
      <div className="bg-white p-4 shadow-sm grid grid-cols-3 gap-2 items-center text-center border-b border-gray-200">
        <div className="flex flex-col items-center">
          <input 
            value={teams.home.name} 
            onChange={(e) => handleTeamNameChange('home', e.target.value)}
            className={`font-bold text-lg w-full text-center bg-transparent border-b border-dashed border-gray-300 focus:border-indigo-500 outline-none ${teams.home.textColorClass}`}
          />
          <span className={`text-5xl font-black mt-1 ${teams.home.textColorClass}`}>{teams.home.score}</span>
        </div>
        <div className="flex flex-col items-center justify-center">
          <span className="text-gray-400 text-2xl font-bold">-</span>
          <span className="text-xs text-gray-400 uppercase mt-1 tracking-wider font-semibold">
            {isMatchFinished ? 'Eindstand' : QUARTER_NAMES[quarter]}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <input 
            value={teams.away.name} 
            onChange={(e) => handleTeamNameChange('away', e.target.value)}
            className={`font-bold text-lg w-full text-center bg-transparent border-b border-dashed border-gray-300 focus:border-indigo-500 outline-none ${teams.away.textColorClass}`}
          />
          <span className={`text-5xl font-black mt-1 ${teams.away.textColorClass}`}>{teams.away.score}</span>
        </div>
      </div>

      {/* --- TIMER --- */}
      <div className="bg-gray-900 text-white py-8 flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
        <div className={`text-7xl font-mono font-bold z-10 tabular-nums tracking-tighter ${time === 0 ? 'text-red-400' : 'text-white'}`}>
          {formatTime(time)}
        </div>
        
        <button 
          onClick={handleStartPause}
          disabled={isMatchFinished}
          className={`mt-6 px-10 py-3 rounded-full text-xl font-bold shadow-lg transition-all active:scale-95 z-10 
            ${isMatchFinished ? 'bg-gray-600 cursor-not-allowed' : 
              isRunning ? 'bg-orange-500 hover:bg-orange-600 text-white ring-4 ring-orange-500/30' : 
              'bg-emerald-500 hover:bg-emerald-600 text-white ring-4 ring-emerald-500/30'}`}
        >
          {isMatchFinished ? 'Wedstrijd Voltooid' : isRunning ? 'PAUZE (Dubbelklik)' : time < matchConfig.quarterDurationSeconds ? 'HERVATTEN' : 'START'}
        </button>
        
        {/* Decorative background circles */}
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-indigo-500 rounded-full opacity-20 blur-2xl"></div>
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-pink-500 rounded-full opacity-20 blur-2xl"></div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* --- ACTIVE CARDS --- */}
        {activeCards.length > 0 && (
          <div className="p-4 bg-white border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Actieve Straffen</h3>
            <div className="grid grid-cols-1 gap-2">
              {activeCards.map(card => (
                <div key={card.id} className={`flex items-center justify-between p-3 rounded-lg border-l-4 shadow-sm ${CARD_CONFIG[card.type].colorClass} ${isRunning && card.timeRemaining > 0 ? 'animate-pulse-red' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${teams[card.team].textColorClass}`}>{teams[card.team].name}</span>
                    <span className="text-xs font-bold bg-white/50 px-2 py-1 rounded text-gray-700">#{card.rugnummer}</span>
                    <span className="text-xs">{CARD_CONFIG[card.type].label}</span>
                  </div>
                  <span className="font-mono font-bold text-lg text-gray-700">
                    {card.type === 'rood' ? 'UIT' : formatTime(card.timeRemaining)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- CONTROLS GRID --- */}
        <div className="p-4 grid grid-cols-2 gap-4">
          {/* Home Controls */}
          <div className="space-y-2">
            <div className={`text-xs font-bold text-center uppercase tracking-wider mb-1 ${teams.home.textColorClass}`}>{teams.home.name}</div>
            <button 
              onClick={() => prepareInputEvent('goal', 'home', 'goal')} 
              className="w-full py-3 bg-white border border-gray-200 text-gray-800 font-bold rounded-lg shadow-sm active:bg-gray-50 flex items-center justify-center gap-2 hover:bg-gray-50"
            >
              <HockeyIcon className="w-5 h-5" />
              <span>Doelpunt</span>
            </button>
            <div className="grid grid-cols-4 gap-1">
              {(Object.keys(CARD_CONFIG) as CardType[]).map(type => (
                <button key={type} onClick={() => prepareInputEvent('card', 'home', type)} className={`h-14 flex flex-col items-center justify-center rounded shadow-sm border ${CARD_CONFIG[type].colorClass} active:scale-95 transition-transform`}>
                  <span className={`text-lg ${CARD_CONFIG[type].textClass}`}>{CARD_CONFIG[type].icon}</span>
                  <span className="text-[10px] font-bold leading-none">{CARD_CONFIG[type].label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Away Controls */}
          <div className="space-y-2">
            <div className={`text-xs font-bold text-center uppercase tracking-wider mb-1 ${teams.away.textColorClass}`}>{teams.away.name}</div>
            <button 
              onClick={() => prepareInputEvent('goal', 'away', 'goal')} 
              className="w-full py-3 bg-white border border-gray-200 text-gray-800 font-bold rounded-lg shadow-sm active:bg-gray-50 flex items-center justify-center gap-2 hover:bg-gray-50"
            >
              <HockeyIcon className="w-5 h-5" />
              <span>Doelpunt</span>
            </button>
            <div className="grid grid-cols-4 gap-1">
              {(Object.keys(CARD_CONFIG) as CardType[]).map(type => (
                <button key={type} onClick={() => prepareInputEvent('card', 'away', type)} className={`h-14 flex flex-col items-center justify-center rounded shadow-sm border ${CARD_CONFIG[type].colorClass} active:scale-95 transition-transform`}>
                  <span className={`text-lg ${CARD_CONFIG[type].textClass}`}>{CARD_CONFIG[type].icon}</span>
                  <span className="text-[10px] font-bold leading-none">{CARD_CONFIG[type].label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* --- TIMELINE --- */}
        <div className="px-4">
           <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tijdlijn</h3>
              <div className="flex gap-2">
                <button onClick={undoLastAction} className="text-xs text-orange-600 font-semibold flex items-center gap-1 bg-orange-50 px-2 py-1 rounded">
                  <span>↩</span> Ongedaan maken
                </button>
                <button onClick={shareTimeline} className="text-xs text-indigo-600 font-semibold flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded">
                  <ShareIcon className="w-3 h-3" /> Delen
                </button>
              </div>
           </div>
           <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-h-64 overflow-y-auto scrollbar-hide p-2">
              {timeline.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-4 italic">Nog geen gebeurtenissen.</p>
              ) : (
                <ul className="space-y-2">
                  {timeline.map(event => {
                    let icon = <span className="text-gray-600">•</span>;
                    let textColor = 'text-gray-600';
                    
                    if (event.type === 'goal') {
                      icon = <span className="text-xl">🏑</span>;
                      textColor = 'font-bold text-gray-900';
                    } else if (event.type === 'card') {
                      if (event.description.includes('Groene')) {
                          // Groene Driehoek
                          icon = <span className="inline-block w-3 h-3 bg-green-500" style={{clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'}}></span>;
                          textColor = 'text-green-700 font-semibold';
                      }
                      else if (event.description.includes('Gele')) {
                          // Geel Vierkant
                          icon = <span className="inline-block w-3 h-3 bg-yellow-400 rounded-sm"></span>;
                          textColor = 'text-yellow-700 font-semibold';
                      }
                      else if (event.description.includes('Rode')) {
                          // Rood Rondje
                          icon = <span className="inline-block w-3 h-3 bg-red-600 rounded-full"></span>;
                          textColor = 'text-red-700 font-bold';
                      }
                    } else if (event.type === 'start') {
                        icon = <span className="text-indigo-600">▶</span>;
                        textColor = 'text-indigo-700 font-medium';
                    } else if (event.type === 'end') {
                        icon = <span className="text-indigo-600">🏁</span>;
                        textColor = 'text-indigo-700 font-medium';
                    }

                    return (
                      <li key={event.id} className="text-sm flex gap-2 border-l-2 border-gray-200 pl-2 py-1 items-start">
                         <span className="font-mono text-gray-400 text-xs min-w-[36px] pt-1">{event.timeDisplay}</span>
                         <div className="flex-1">
                           <div className={`flex items-center gap-2 ${textColor}`}>
                             {icon}
                             <span>{event.description}</span>
                           </div>
                           {event.rugnummer && <span className="text-xs bg-gray-100 px-1 rounded text-gray-500 ml-5">#{event.rugnummer}</span>}
                         </div>
                      </li>
                    );
                  })}
                </ul>
              )}
           </div>
           
           {/* --- FIELD TRACKER --- */}
           <FieldTracker key={fieldTrackerKey} isRunning={isRunning} quarter={quarter} />
           
           <div className="mt-6 flex justify-center gap-4 text-sm text-gray-400">
              <button onClick={() => setShowConfig(true)} className="underline hover:text-gray-600">Instellingen</button>
              <button onClick={() => setModalData({ title: 'Reset Wedstrijd', message: 'Weet je zeker dat je de hele wedstrijd wilt resetten?', onConfirm: resetMatch })} className="underline hover:text-red-500">Reset Alles</button>
           </div>
        </div>
      </div>

      {/* --- MODALS --- */}
      
      {/* Generic Alert/Confirm Modal */}
      {modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{modalData.title}</h3>
            <p className="text-gray-600 mb-6">{modalData.message}</p>
            <div className="flex gap-3">
              {modalData.onConfirm && (
                <button onClick={() => setModalData(null)} className="flex-1 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg">Annuleren</button>
              )}
              <button 
                onClick={() => { modalData.onConfirm?.(); setModalData(null); }} 
                className="flex-1 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-lg hover:bg-indigo-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Modal (Goal & Card) */}
      {inputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
            <h3 className="text-lg font-bold text-center mb-1">
              {inputModal.type === 'goal' ? 'Doelpunt' : `${inputModal.subType === 'rood' ? 'Rode' : 'Tijdstraf'} Kaart`}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              Voor {teams[inputModal.team].name}
            </p>

            {/* Goal Type Selector */}
            {inputModal.type === 'goal' && (
              <div className="mb-4 flex flex-col gap-2">
                 <label className="text-xs font-bold text-gray-700 uppercase">Type Doelpunt</label>
                 <div className="flex gap-1">
                   {['Velddoelpunt', 'Strafcorner', 'Strafbal'].map(type => (
                     <button 
                      key={type}
                      onClick={() => setGoalType(type as any)}
                      className={`flex-1 py-2 text-[10px] font-bold rounded border ${goalType === type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`}
                     >
                       {type === 'Velddoelpunt' ? 'Veld' : type === 'Strafcorner' ? 'SC' : 'SB'}
                     </button>
                   ))}
                 </div>
              </div>
            )}
            
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Rugnummer</label>
            <input 
              autoFocus
              type="number" 
              value={inputNumber}
              onChange={(e) => setInputNumber(e.target.value)}
              className="w-full text-center text-3xl font-mono font-bold border-2 border-indigo-100 rounded-xl p-3 mb-6 focus:border-indigo-500 focus:ring-0 outline-none bg-gray-50"
              placeholder="#"
            />
            
            <div className="flex gap-2">
              <button onClick={() => setInputModal(null)} className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl">Annuleren</button>
              <button onClick={confirmInputEvent} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md">Bevestigen</button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold mb-4">Instellingen</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kwarten</label>
                <div className="flex gap-2">
                   {[2, 4].map(n => (
                     <button 
                      key={n}
                      onClick={() => setMatchConfig(p => ({ ...p, quarterCount: n }))}
                      className={`flex-1 py-2 rounded-lg border ${matchConfig.quarterCount === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}
                     >
                       {n}
                     </button>
                   ))}
                </div>
              </div>

              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Tijd per kwart</label>
                 <div className="flex gap-2 items-center">
                   <div className="flex-1">
                     <span className="text-xs text-gray-500">Minuten</span>
                     <input 
                       type="number" 
                       value={Math.floor(matchConfig.quarterDurationSeconds / 60)}
                       onChange={(e) => {
                          const mins = parseInt(e.target.value) || 0;
                          const secs = matchConfig.quarterDurationSeconds % 60;
                          const newTotal = mins * 60 + secs;
                          setMatchConfig(p => ({ ...p, quarterDurationSeconds: newTotal }));
                          if (!isRunning && time === matchConfig.quarterDurationSeconds) setTime(newTotal);
                       }}
                       className="w-full border border-gray-300 rounded-lg p-2"
                     />
                   </div>
                   <span className="mt-4">:</span>
                   <div className="w-20">
                     <span className="text-xs text-gray-500">Seconden</span>
                     <input 
                       type="number" 
                       max="59"
                       min="0"
                       value={matchConfig.quarterDurationSeconds % 60}
                       onChange={(e) => {
                          const secs = parseInt(e.target.value) || 0;
                          const mins = Math.floor(matchConfig.quarterDurationSeconds / 60);
                          const newTotal = mins * 60 + secs;
                          setMatchConfig(p => ({ ...p, quarterDurationSeconds: newTotal }));
                          if (!isRunning && time === matchConfig.quarterDurationSeconds) setTime(newTotal);
                       }}
                       className="w-full border border-gray-300 rounded-lg p-2"
                     />
                   </div>
                 </div>
              </div>
            </div>

            <button onClick={() => setShowConfig(false)} className="w-full mt-6 py-3 bg-indigo-600 text-white font-bold rounded-xl">Opslaan</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;