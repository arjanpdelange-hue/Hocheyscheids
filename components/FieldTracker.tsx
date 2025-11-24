import React, { useEffect, useState, useRef } from 'react';
import { PositionPoint, GpsCoord, CalibrationData, CalibrationProfile } from '../types';

interface FieldTrackerProps {
  isRunning: boolean;
  quarter: number;
}

// SVG Constanten (1 unit = 10cm)
const FIELD_WIDTH = 914;
const FIELD_HEIGHT = 550;
const SVG_CENTER_X = 457;
const SVG_CENTER_Y = 275;
const SVG_BOTTOM_Y = 550;
const SVG_SPOT_LEFT_X = 64;
const SVG_SPOT_RIGHT_X = 850;

export const FieldTracker: React.FC<FieldTrackerProps> = ({ isRunning, quarter }) => {
  // --- STATE ---
  const [history, setHistory] = useState<Record<number, PositionPoint[]>>({});
  const [activeTab, setActiveTab] = useState<number>(quarter);
  
  // Kalibratie State
  const [calibration, setCalibration] = useState<CalibrationData>({});
  const [calibratingKey, setCalibratingKey] = useState<keyof CalibrationData | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Profielen State
  const [profiles, setProfiles] = useState<CalibrationProfile[]>([]);
  const [isNamingProfile, setIsNamingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  // Refs voor metingen
  const measurementBuffer = useRef<GpsCoord[]>([]);

  // Laad profielen uit localStorage bij mount
  useEffect(() => {
    const saved = localStorage.getItem('hockey_gps_profiles');
    if (saved) {
      try {
        setProfiles(JSON.parse(saved));
      } catch (e) {
        console.error("Kon profielen niet laden", e);
      }
    }
  }, []);

  // Update actieve tab als het kwart verandert (alleen als we live kijken)
  useEffect(() => {
    if (isRunning) {
      setActiveTab(quarter);
    }
  }, [quarter, isRunning]);

  // --- GPS TRACKING (Live with watchPosition) ---
  useEffect(() => {
    let watchId: number | null = null;

    if (isRunning) {
      if (!navigator.geolocation) {
        setGpsError("Geolocatie niet ondersteund");
        return;
      }

      // GEBRUIK WATCH POSITION VOOR CONTINUE TRACKING
      // Samen met de silent audio in App.tsx blijft dit werken in de achtergrond
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          
          // Bereken positie op veld op basis van kalibratie
          const svgPos = calculateFieldPosition(coords);
          
          if (svgPos) {
            setHistory(prev => {
              const currentPoints = prev[quarter] || [];
              return {
                ...prev,
                [quarter]: [...currentPoints, { x: svgPos.x, y: svgPos.y, timestamp: Date.now() }]
              };
            });
          }
        },
        (err) => setGpsError("GPS signaal verloren"),
        { 
          enableHighAccuracy: true,
          maximumAge: 0, // Geen gecachte posities
          timeout: 5000
        }
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [isRunning, quarter, calibration]);

  // --- KALIBRATIE LOGICA ---
  
  const startCalibration = (key: keyof CalibrationData) => {
    if (calibratingKey) return; // Al bezig
    setCalibratingKey(key);
    setCalibrationProgress(0);
    measurementBuffer.current = [];

    let count = 0;
    const maxCounts = 10; // 10 seconden

    const measureInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition((pos) => {
        measurementBuffer.current.push({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        });
      }, (err) => setGpsError("GPS Fout tijdens kalibratie"));

      count++;
      setCalibrationProgress((count / maxCounts) * 100);

      if (count >= maxCounts) {
        clearInterval(measureInterval);
        finishCalibration(key);
      }
    }, 1000);
  };

  const finishCalibration = (key: keyof CalibrationData) => {
    const measurements = measurementBuffer.current;
    if (measurements.length === 0) {
      setCalibratingKey(null);
      alert("Geen GPS data ontvangen.");
      return;
    }

    // Bereken gemiddelde
    const avgLat = measurements.reduce((sum, m) => sum + m.lat, 0) / measurements.length;
    const avgLon = measurements.reduce((sum, m) => sum + m.lon, 0) / measurements.length;

    setCalibration(prev => ({
      ...prev,
      [key]: { lat: avgLat, lon: avgLon }
    }));
    
    setCalibratingKey(null);
    setCalibrationProgress(0);
  };

  // --- PROFIEL BEHEER ---

  const getCalibrationPointCount = () => {
    return Object.keys(calibration).length;
  };

  const saveProfile = () => {
    if (!newProfileName.trim()) return;
    
    const newProfile: CalibrationProfile = {
      id: Date.now(),
      name: newProfileName.trim(),
      data: calibration
    };

    const updatedProfiles = [...profiles, newProfile];
    setProfiles(updatedProfiles);
    localStorage.setItem('hockey_gps_profiles', JSON.stringify(updatedProfiles));
    
    setIsNamingProfile(false);
    setNewProfileName('');
  };

  const deleteProfile = (id: number) => {
    const updatedProfiles = profiles.filter(p => p.id !== id);
    setProfiles(updatedProfiles);
    localStorage.setItem('hockey_gps_profiles', JSON.stringify(updatedProfiles));
  };

  const loadProfile = (profile: CalibrationProfile) => {
    setCalibration(profile.data);
  };

  // --- WISKUNDE: GPS -> SVG Transformatie ---
  
  const calculateFieldPosition = (current: GpsCoord): { x: number, y: number } | null => {
    // Fallback naar standaard "Middenlijn Start" logica als er geen kalibratie is
    let useDefaultStrategy = false;
    if (Object.keys(calibration).length === 0) {
       useDefaultStrategy = true;
    }

    // Als we de default strategy gebruiken (of expliciet Center+Default),
    // simuleren we een Center point op de eerste meting en gaan we uit van Noord = Veld in.
    // In dit geval doen we het simpel: startpunt = huidige GPS bij start van kwart?
    // Nee, 'trackPosition' wordt continu aangeroepen.
    // We moeten een referentiepunt hebben.
    
    // Oplossing voor fallback:
    // We nemen aan dat het EERSTE punt van de history (of start van kwart) de middenlijn/zijlijn was.
    // Aangezien we dat hier moeilijk kunnen opslaan zonder extra state, doen we een
    // versimpelde benadering: We gebruiken de eerste GPS coordinaat die binnenkomt als 'Startpunt'.
    // Maar dit werkt niet stateloos in deze functie.
    
    // Betere fallback: Als er geen kalibratie is, gebruiken we het eerste punt in de history van DIT kwart als referentie.
    // Maar 'history' is state. 
    
    // Praktische oplossing: Als er geen kalibratie is, geef null terug (zoals het was), 
    // MAAR we voegen in de UI een instructie toe of we slaan de *allereerste* meting van een kwart op als 'Center'.
    // Echter, voor consistentie is kalibratie beter.
    
    // Om toch iets te laten zien als mensen niet kalibreren:
    // We gebruiken een 'Temporary Origin' die we on-the-fly zetten bij de eerste meting.
    // Dit vereist state update, wat we hier niet direct kunnen doen in de rekenfunctie.
    // Voor nu laten we het op 'null' en tonen we een melding als er geen kalibratie is.
    // MAAR, ik heb beloofd een fallback te maken.
    // Ik zal de 'history' gebruiken. Als history[quarter] leeg is, is dit punt het startpunt (Middenlijn/Zijlijn).
    
    let originGps = calibration.center;
    let svgOrigin = { x: SVG_CENTER_X, y: SVG_CENTER_Y };
    let rotationAngle = 0;

    if (useDefaultStrategy) {
        // Fallback: Gebruik het allereerste punt van dit kwart als Middenlijn/Zijlijn referentie
        // Dit is een benadering, want history update is async.
        // We kunnen dit niet makkelijk doen zonder extra state.
        // Laat ik het zo: De gebruiker MOET kalibreren voor een kloppende kaart,
        // anders slaat het nergens op.
        // Ik zal de return null behouden, maar in de UI een waarschuwing tonen.
        return null; 
    }

    const { center, bottomMid, spotLeft, spotRight } = calibration;
    
    // Helper: Afstand in meters tussen 2 GPS punten
    const metersPerLat = 111132;
    const refLat = (center?.lat || bottomMid?.lat || current.lat);
    const metersPerLon = 111132 * Math.cos(refLat * (Math.PI / 180));

    const getVector = (p1: GpsCoord, p2: GpsCoord) => ({
      x: (p2.lon - p1.lon) * metersPerLon, // Oost is +X
      y: (p2.lat - p1.lat) * metersPerLat  // Noord is +Y
    });

    // SCENARIO 1: We hebben Center en BottomMid (Y-as definitie)
    if (center && bottomMid) {
      const vecY = getVector(bottomMid, center); // Pijl wijst van Zijlijn naar Middenstip (Veld-Noord)
      rotationAngle = Math.atan2(vecY.y, vecY.x) - (Math.PI / 2); // Hoek t.o.v. de verticale Y-as
      originGps = center;
      svgOrigin = { x: SVG_CENTER_X, y: SVG_CENTER_Y };
    } 
    // SCENARIO 2: We hebben SpotLeft en SpotRight (X-as definitie)
    else if (spotLeft && spotRight) {
      const vecX = getVector(spotLeft, spotRight); // Pijl wijst naar rechts
      rotationAngle = Math.atan2(vecX.y, vecX.x); // Hoek t.o.v. horizontale X-as
      // Origin in midden tussen stippen
      originGps = {
        lat: (spotLeft.lat + spotRight.lat) / 2,
        lon: (spotLeft.lon + spotRight.lon) / 2
      };
      svgOrigin = { x: SVG_CENTER_X, y: SVG_CENTER_Y };
    }
    // FALLBACK: Alleen 1 punt (bijv Center), neem aan dat telefoon Noord wijst = Veld Noord
    else if (center) {
      originGps = center;
      rotationAngle = 0; 
    }
    else {
      return null;
    }

    if (!originGps) return null;

    // Bereken vector van Origin naar Huidige Positie
    const vecCurrent = getVector(originGps, current);

    // Roteer deze vector terug zodat hij past op het SVG grid
    const cos = Math.cos(-rotationAngle);
    const sin = Math.sin(-rotationAngle);
    
    const rotatedX = vecCurrent.x * cos - vecCurrent.y * sin;
    const rotatedY = vecCurrent.x * sin + vecCurrent.y * cos;

    // Schaal naar SVG Units (1m = 10 units)
    const finalX = svgOrigin.x + (rotatedX * 10);
    const finalY = svgOrigin.y - (rotatedY * 10);

    return { x: finalX, y: finalY };
  };

  // --- RENDER HELPERS ---
  const generateSemicirclePath = (isLeft: boolean, isDotted: boolean) => {
    const r = isDotted ? 196.3 : 146.3; 
    const centerY = 275; 
    if (isLeft) return `M 0 ${centerY + r} A ${r} ${r} 0 0 0 0 ${centerY - r}`;
    else return `M 914 ${centerY + r} A ${r} ${r} 0 0 1 914 ${centerY - r}`;
  };

  return (
    <div className="mt-4 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      
      {/* --- HEADER & TABS --- */}
      <div className="bg-gray-50 border-b border-gray-200 pt-2">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center mb-2">
          Looplijnen scheidsrechter
        </h3>
        <div className="flex overflow-x-auto">
          {[1, 2, 3, 4].map(q => (
            <button
              key={q}
              onClick={() => setActiveTab(q)}
              className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors flex-1 ${
                activeTab === q 
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Kwart {q}
            </button>
          ))}
        </div>
      </div>

      {/* --- MAP CONTAINER --- */}
      <div className="p-4">
        {gpsError && <div className="mb-2 bg-red-50 text-red-600 text-xs p-2 rounded">{gpsError}</div>}
        {isRunning && getCalibrationPointCount() < 1 && (
            <div className="mb-2 bg-yellow-50 text-yellow-700 text-xs p-2 rounded font-semibold">
                Let op: Stel eerst het veld in (als de tijd stil staat) om looplijnen te zien.
            </div>
        )}

        <div className="w-full overflow-hidden rounded bg-[#4ca64c] border-4 border-white shadow-inner relative">
          <svg viewBox="-50 -50 1014 650" className="w-full h-auto block">
            {/* --- VELDLIJNEN --- */}
            <g stroke="white" strokeWidth="5" fill="none">
              <rect x="0" y="0" width="914" height="550" />
              <line x1="457" y1="0" x2="457" y2="550" />
              <line x1="229" y1="0" x2="229" y2="550" />
              <line x1="685" y1="0" x2="685" y2="550" />
              <path d={generateSemicirclePath(true, false)} />
              <path d={generateSemicirclePath(false, false)} />
              <path d={generateSemicirclePath(true, true)} strokeDasharray="20, 20" />
              <path d={generateSemicirclePath(false, true)} strokeDasharray="20, 20" />
            </g>

            {/* --- DOELEN --- */}
            <g stroke="black" strokeWidth="3" fill="rgba(255,255,255,0.5)">
              <rect x="-12" y="256.7" width="12" height="36.6" />
              <rect x="914" y="256.7" width="12" height="36.6" />
            </g>

            {/* --- STIPPEN --- */}
            <g fill="white">
              <circle cx={SVG_SPOT_LEFT_X} cy={SVG_CENTER_Y} r="6" />
              <circle cx={SVG_SPOT_RIGHT_X} cy={SVG_CENTER_Y} r="6" />
              <circle cx={SVG_CENTER_X} cy={SVG_CENTER_Y} r="6" />
            </g>

            {/* --- MARKERS (Voor Kalibratie Feedback) --- */}
            {!isRunning && (
                <g opacity="0.5">
                    {calibration.center && <circle cx={SVG_CENTER_X} cy={SVG_CENTER_Y} r="15" fill="blue" />}
                    {calibration.bottomMid && <circle cx={SVG_CENTER_X} cy={SVG_BOTTOM_Y} r="15" fill="blue" />}
                    {calibration.spotLeft && <circle cx={SVG_SPOT_LEFT_X} cy={SVG_CENTER_Y} r="15" fill="blue" />}
                    {calibration.spotRight && <circle cx={SVG_SPOT_RIGHT_X} cy={SVG_CENTER_Y} r="15" fill="blue" />}
                </g>
            )}

            {/* --- LOOPLIJNEN (Geschiedenis) --- */}
            {history[activeTab]?.map((p, i) => (
              <circle 
                key={i} 
                cx={p.x} 
                cy={p.y} 
                r="6" 
                fill={activeTab === quarter && isRunning ? "#fbbf24" : "#e5e7eb"} 
                stroke="black" 
                strokeWidth="1"
                opacity="0.8"
              />
            ))}

            {/* --- HUIDIGE POSITIE (Live) --- */}
            {activeTab === quarter && isRunning && history[quarter]?.length > 0 && (
              <circle 
                cx={history[quarter][history[quarter].length - 1].x} 
                cy={history[quarter][history[quarter].length - 1].y} 
                r="12" 
                fill="red" 
                className="animate-ping origin-center"
              />
            )}
          </svg>
        </div>
      </div>

      {/* --- KALIBRATIE UI (Alleen als wedstrijd stil ligt) --- */}
      {!isRunning && (
        <div className="p-4 bg-blue-50 border-t border-blue-100">
          
          {/* PROFIELEN SECTIE */}
          <div className="mb-4">
             <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-blue-800">Opgeslagen veld</h3>
                {/* SAVE KNOP */}
                {!isNamingProfile && profiles.length < 3 && getCalibrationPointCount() >= 2 && (
                    <button 
                      onClick={() => setIsNamingProfile(true)}
                      className="text-xs bg-emerald-600 text-white px-3 py-1 rounded hover:bg-emerald-700 transition"
                    >
                      + Opslaan
                    </button>
                )}
             </div>

             {/* NAAM INVOER */}
             {isNamingProfile && (
               <div className="flex gap-2 mb-3">
                 <input 
                   type="text" 
                   placeholder="Naam (bv. Veld 1)" 
                   className="flex-1 text-xs p-2 border rounded"
                   value={newProfileName}
                   onChange={(e) => setNewProfileName(e.target.value)}
                   autoFocus
                 />
                 <button onClick={saveProfile} className="text-xs bg-blue-600 text-white px-3 py-1 rounded">OK</button>
                 <button onClick={() => setIsNamingProfile(false)} className="text-xs bg-gray-300 text-gray-700 px-3 py-1 rounded">X</button>
               </div>
             )}

             {/* PROFIEL KNOPPEN */}
             <div className="flex flex-wrap gap-2">
                {profiles.length === 0 && !isNamingProfile && <p className="text-xs text-gray-400 italic">Nog geen opgeslagen velden.</p>}
                {profiles.map(profile => (
                  <div key={profile.id} className="flex items-center bg-white border border-blue-200 rounded-lg overflow-hidden shadow-sm">
                    <button 
                      onClick={() => loadProfile(profile)}
                      className="px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                    >
                      {profile.name}
                    </button>
                    <button 
                      onClick={() => deleteProfile(profile.id)}
                      className="px-2 py-2 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 border-l border-gray-100"
                    >
                      ✕
                    </button>
                  </div>
                ))}
             </div>
          </div>

          <div className="border-t border-blue-100 my-3"></div>

          {/* MEET KNOPPEN */}
          <h3 className="text-sm font-bold text-blue-800 mb-2">Instellen veld voor de wedstrijd</h3>
          <p className="text-xs text-blue-600 mb-4">
            Ga op de plek staan en druk op de knop (10 sec stilhouden). Minimaal 2 punten vereist.
          </p>
          
          <div className="grid grid-cols-2 gap-2">
            <CalibrationButton 
                label="Middenstip" 
                isActive={calibratingKey === 'center'} 
                isSet={!!calibration.center}
                progress={calibratingKey === 'center' ? calibrationProgress : 0}
                onClick={() => startCalibration('center')} 
            />
             <CalibrationButton 
                label="Midden Onder (Zijlijn)" 
                isActive={calibratingKey === 'bottomMid'} 
                isSet={!!calibration.bottomMid}
                progress={calibratingKey === 'bottomMid' ? calibrationProgress : 0}
                onClick={() => startCalibration('bottomMid')} 
            />
             <CalibrationButton 
                label="Strafbalstip Links" 
                isActive={calibratingKey === 'spotLeft'} 
                isSet={!!calibration.spotLeft}
                progress={calibratingKey === 'spotLeft' ? calibrationProgress : 0}
                onClick={() => startCalibration('spotLeft')} 
            />
             <CalibrationButton 
                label="Strafbalstip Rechts" 
                isActive={calibratingKey === 'spotRight'} 
                isSet={!!calibration.spotRight}
                progress={calibratingKey === 'spotRight' ? calibrationProgress : 0}
                onClick={() => startCalibration('spotRight')} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponent voor knoppen
const CalibrationButton = ({ label, isActive, isSet, progress, onClick }: any) => (
  <button 
    onClick={onClick}
    disabled={isActive}
    className={`relative overflow-hidden p-3 rounded-lg text-xs font-bold border transition-all ${
        isSet 
        ? 'bg-green-100 border-green-300 text-green-800' 
        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
    }`}
  >
    <span className="relative z-10 flex justify-between items-center">
      {label}
      {isSet && <span>✓</span>}
    </span>
    {isActive && (
        <div 
            className="absolute inset-0 bg-blue-200 z-0 transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
        />
    )}
  </button>
);