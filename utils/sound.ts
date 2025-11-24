export const playBeep = (frequency: number = 880, duration: number = 200, count: number = 1) => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  
  const ctx = new AudioContext();
  
  const playTone = (i: number) => {
    if (i >= count) return;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Square wave klinkt harder/scherper dan sine, goed voor signalen
    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    // Volume aanzienlijk verhoogd (van 0.1 naar 0.6) voor betere hoorbaarheid op het veld
    const volume = 0.6;
    const startTime = ctx.currentTime;
    const endTime = startTime + duration / 1000;

    // Direct naar doelvolume
    gain.gain.setValueAtTime(volume, startTime);
    
    // Houd het volume vast tot vlak voor het einde (sustain)
    // Dit voorkomt dat de piep "zachtjes" wegsterft en maakt hem dwingender
    gain.gain.setValueAtTime(volume, Math.max(startTime, endTime - 0.05));
    
    // Korte fade-out om 'klikken' van de speaker te voorkomen
    gain.gain.linearRampToValueAtTime(0.0001, endTime);
    
    osc.start(startTime);
    osc.stop(endTime);
    
    osc.onended = () => {
      // Korte pauze tussen piepjes als count > 1
      setTimeout(() => playTone(i + 1), 150);
    };
  };

  playTone(0);
};