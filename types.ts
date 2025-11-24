

export type TeamId = 'home' | 'away';

export type CardType = 'groen' | 'geel_5' | 'geel_10' | 'rood';

export interface Team {
  name: string;
  score: number;
  color: string; // Hex code
  textColorClass: string;
}

export interface ActiveCard {
  id: number;
  team: TeamId;
  type: CardType;
  timeRemaining: number; // in seconds
  rugnummer: string;
}

export interface TimelineEvent {
  id: number;
  timestamp: number;
  quarter: number;
  timeDisplay: string; // MM:SS
  description: string;
  type: 'goal' | 'card' | 'start' | 'pause' | 'end' | 'general';
  team?: TeamId;
  rugnummer?: string;
}

export interface MatchConfig {
  quarterCount: number;
  quarterDurationSeconds: number;
}

export interface PositionPoint {
  x: number; // SVG Unit
  y: number; // SVG Unit
  timestamp: number;
}

// Kalibratie data structuur
export interface GpsCoord {
  lat: number;
  lon: number;
}

export interface CalibrationData {
  center?: GpsCoord;      // Middenstip
  bottomMid?: GpsCoord;   // Midden Onder (Zijlijn)
  spotLeft?: GpsCoord;    // Strafbalstip Links
  spotRight?: GpsCoord;   // Strafbalstip Rechts
}

// Opgeslagen profiel
export interface CalibrationProfile {
  id: number;
  name: string;
  data: CalibrationData;
}

export interface AssistantMessage {
  role: 'user' | 'model';
  text: string;
}
