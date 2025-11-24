import { CardType } from './types';

export const DEFAULT_QUARTER_DURATION = 17 * 60 + 30; // 17:30
export const DEFAULT_QUARTER_COUNT = 4;

export const CARD_CONFIG: Record<CardType, { duration: number; label: string; colorClass: string; textClass: string; icon: string }> = {
  'groen': { duration: 120, label: '2 min', colorClass: 'bg-green-100 border-green-500', textClass: 'text-green-800', icon: '▲' },
  'geel_5': { duration: 300, label: '5 min', colorClass: 'bg-yellow-100 border-yellow-500', textClass: 'text-yellow-800', icon: '■' },
  'geel_10': { duration: 600, label: '10 min', colorClass: 'bg-yellow-100 border-yellow-500', textClass: 'text-yellow-800', icon: '■' },
  'rood': { duration: 0, label: 'Rood', colorClass: 'bg-red-100 border-red-500', textClass: 'text-red-800', icon: '●' },
};

export const QUARTER_NAMES: Record<number, string> = {
  1: '1e Kwart',
  2: '2e Kwart',
  3: '3e Kwart',
  4: '4e Kwart',
  5: 'Shoot-outs'
};

// Extracted knowledge from the provided PDFs for the AI Assistant
export const HOCKEY_RULES_CONTEXT = `
Je bent een expert scheidsrechter assistent voor Veldhockey (seizoen 2025-2026) in Nederland (KNHB).
Gebruik de volgende regels en afspraken om vragen te beantwoorden. Antwoord kort en bondig.

1. WEDSTRIJDDUUR: 
- Standaard: 4 x 17,5 minuut. Rust: 2 min na Q1/Q3, 10 min na Q2.
- Hoofdklasse wijkt af (4x15).

2. HOGE BAL (Regel 9.10 & Afspraken 2025):
- De oude interpretatie (fase 1/2/3) is VERVALLEN.
- Nieuwe regel: Beoordeel puur op GEVAAR.
- Spelers mogen niet binnen 5 meter komen van een tegenstander die een bal probeert te ontvangen (ontvanger heeft recht op de bal).
- Bal mag binnen 5m onderschept worden MITS VEILIG (geen duel/gevaar).
- Hoge bal op doel (schot): als intentie scoren is, mag het, ook als de bal net naast gaat.

3. STRAFCORNER (SC):
- Duur: Max 40 seconden om klaar te staan. Tijd staat NIET stil (behalve in Hoofdklasse of bij blessure/kaart).
- Te vroeg uitlopen verdediger: Middenlijn.
- Te vroeg uitlopen aanvaller: Cirkel uit (overnemen door andere speler is niet meer van toepassing, diegene moet weg).
- Beschermende kleding: MOET af na de SC. Niet mee spelen. Weggooien moet veilig. Onveilig weggooien = strafcorner tegen.
- Nieuw 2025: Dringend advies masker te dragen bij verdedigen SC.

4. KAARTEN:
- Groen: 2 minuten tijdstraf. (Driehoek)
- Geel: 5 of 10 minuten. (Vierkant). 10 min voor zware fysieke overtreding of onsportief gedrag (schelden).
- Rood: Definitief eruit. Team speelt met minder. (Rondje).
- Aanvoerder krijgt kaarten voor wangedrag team als dader onbekend is.

5. SHOOT-OUTS:
- 8 seconden per poging.
- Overtreding verdediger (onopzettelijk) = opnieuw of strafbal (indien goal voorkomen).
- Overtreding verdediger (opzettelijk) = strafbal.

6. ARBITRAGE MANAGEMENT:
- Crowding (protesteren met meerdere spelers): Groene kaart.
- Hevig protesteren: Minimaal groen, mogelijk geel.
- Cynisch klappen/wegwerpgebaar: Geel.
- Dubbele kaart voor zelfde fout = zwaardere straf.

7. SELF-PASS:
- Mag NIET direct de cirkel in. Bal moet eerst 5 meter rollen of geraakt zijn door andere speler.
- Bij vrije slag binnen 23m: Iedereen op 5 meter afstand.

Antwoord altijd gebaseerd op deze KNHB regels.
`;