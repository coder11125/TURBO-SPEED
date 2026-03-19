import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const TRACK_WIDTH = 1200;
const TRACK_HEIGHT = 850;

// Car physics constants
const ACCELERATION = 0.035;
const MAX_SPEED = 2.4;
const NITRO_SPEED = 4.125;
const NITRO_ACCEL = 0.08;
const FRICTION = 0.97;
const TURN_SPEED = 0.028;
const DRIFT_FACTOR = 0.94;

// Track Geometry
const TRACK_RADIUS = 50; // Slightly narrower for more technical turns
const TRACK_SEGMENTS = [
    { start: {x: 150, y: 500}, end: {x: 450, y: 500}, angle: 0 },
    { start: {x: 450, y: 500}, end: {x: 450, y: 300}, angle: -Math.PI/2 },
    { start: {x: 450, y: 300}, end: {x: 300, y: 300}, angle: Math.PI },
    { start: {x: 300, y: 300}, end: {x: 300, y: 100}, angle: -Math.PI/2 },
    { start: {x: 300, y: 100}, end: {x: 750, y: 100}, angle: 0 },
    { start: {x: 750, y: 100}, end: {x: 750, y: 400}, angle: Math.PI/2 },
    { start: {x: 750, y: 400}, end: {x: 600, y: 400}, angle: Math.PI },
    { start: {x: 600, y: 400}, end: {x: 600, y: 600}, angle: Math.PI/2 },
    { start: {x: 600, y: 600}, end: {x: 950, y: 600}, angle: 0 },
    { start: {x: 950, y: 600}, end: {x: 950, y: 150}, angle: -Math.PI/2 },
    { start: {x: 950, y: 150}, end: {x: 1100, y: 150}, angle: 0 },
    { start: {x: 1100, y: 150}, end: {x: 1100, y: 750}, angle: Math.PI/2 },
    { start: {x: 1100, y: 750}, end: {x: 150, y: 750}, angle: Math.PI },
    { start: {x: 150, y: 750}, end: {x: 150, y: 500}, angle: -Math.PI/2 }
];

// Math helpers for collision
function getClosestPointOnSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return v;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
}

function distToSegmentSquared(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

function distToSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

const isPointOnTrackMath = (x: number, y: number, buffer: number = 0): boolean => {
  const p = {x, y};
  let minDist = Infinity;
  
  for (const seg of TRACK_SEGMENTS) {
    const d = distToSegment(p, seg.start, seg.end);
    if (d < minDist) minDist = d;
  }

  return minDist <= (TRACK_RADIUS + buffer);
};

// 3D Components
const CarModel = ({ color, drifting }: { color: string, drifting?: boolean }) => {
  return (
    <group scale={[2, 2, 2]}>
      {/* Body */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[2, 1, 4]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 1.2, -0.5]}>
        <boxGeometry args={[1.8, 0.8, 2]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Wheels */}
      <mesh position={[1.1, 0.4, 1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-1.1, 0.4, 1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[1.1, 0.4, -1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-1.1, 0.4, -1.2]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 16]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Headlights */}
      <mesh position={[0.6, 0.6, 2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={2} />
      </mesh>
      <mesh position={[-0.6, 0.6, 2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={2} />
      </mesh>
      {/* Taillights */}
      <mesh position={[0.6, 0.6, -2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={1} />
      </mesh>
      <mesh position={[-0.6, 0.6, -2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={1} />
      </mesh>
      
      {/* Drift Smoke Particles (Simple visual representation attached to car) */}
      {drifting && (
        <>
          <mesh position={[1.2, 0.2, -1.5]}>
             <sphereGeometry args={[0.3, 8, 8]} />
             <meshBasicMaterial color="#aaa" transparent opacity={0.6} />
          </mesh>
          <mesh position={[-1.2, 0.2, -1.5]}>
             <sphereGeometry args={[0.3, 8, 8]} />
             <meshBasicMaterial color="#aaa" transparent opacity={0.6} />
          </mesh>
        </>
      )}

      <pointLight position={[0, 2, 4]} intensity={10} distance={20} color="white" />
    </group>
  );
};

const Tree = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.6, 0.8, 6, 8]} />
        <meshStandardMaterial color="#4d2926" />
      </mesh>
      {/* Leaves */}
      <mesh position={[0, 9, 0]}>
        <coneGeometry args={[4, 10, 8]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>
      <mesh position={[0, 13, 0]}>
        <coneGeometry args={[3, 7, 8]} />
        <meshStandardMaterial color="#3a7532" />
      </mesh>
    </group>
  );
};

const Rock = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <mesh position={position} scale={scale}>
      <dodecahedronGeometry args={[1.5, 0]} />
      <meshStandardMaterial color="#666" roughness={0.9} />
    </mesh>
  );
};

const TrackMesh = () => {
  const segments = useMemo(() => {
    return TRACK_SEGMENTS.map((seg, i) => {
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const centerX = (seg.start.x + seg.end.x) / 2;
      const centerY = (seg.start.y + seg.end.y) / 2;
      return { length, angle, centerX, centerY, id: i };
    });
  }, []);

  const corners = useMemo(() => {
    return TRACK_SEGMENTS.map((seg) => seg.start);
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={[1, -1, 1]}>
      {/* Grass/Off-track */}
      <mesh position={[TRACK_WIDTH/2, TRACK_HEIGHT/2, -0.1]}>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color="#1a472a" roughness={1} />
      </mesh>
      
      {/* Track Segments */}
      {segments.map((seg) => (
        <mesh key={seg.id} position={[seg.centerX, seg.centerY, 0.1]} rotation={[0, 0, seg.angle]}>
          <planeGeometry args={[seg.length, TRACK_RADIUS * 2]} />
          <meshStandardMaterial color="#333" roughness={0.8} />
        </mesh>
      ))}

      {/* Smooth Corners */}
      {corners.map((pos, i) => (
        <mesh key={i} position={[pos.x, pos.y, 0.1]}>
          <circleGeometry args={[TRACK_RADIUS, 32]} />
          <meshStandardMaterial color="#333" roughness={0.8} />
        </mesh>
      ))}
      
      {/* Start Line */}
      <mesh position={[625, 750, 0.11]} rotation={[0, 0, 0]}>
        <planeGeometry args={[10, TRACK_RADIUS * 2]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </group>
  );
};

const GameScene = ({ 
  localPlayerRef, 
}: { 
  localPlayerRef: React.MutableRefObject<any>, 
}) => {
  const { camera } = useThree();
  const carRef = useRef<THREE.Group>(null);

  const decorations = useMemo(() => {
    const items: { type: 'tree' | 'rock', pos: [number, number, number], scale: number }[] = [];
    const count = 40; // Reduced for performance
    const seed = 42;
    const rng = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };
    let s = seed;

    for (let i = 0; i < count; i++) {
      // Area large enough to fill the new draw distance
      const x = rng(s++) * 2400 - 800; 
      const z = rng(s++) * 2200 - 800;
      
      // Check if on track using the math helper with a buffer to account for decoration size
      if (!isPointOnTrackMath(x, z, 20)) {
        const type = rng(s++) > 0.4 ? 'tree' : 'rock';
        const scale = type === 'tree' ? 2.5 + rng(s++) * 3.5 : 3 + rng(s++) * 5;
        items.push({ type, pos: [x, 0, z], scale });
      }
    }
    return items;
  }, []);
  
  useFrame((state, delta) => {
    if (localPlayerRef.current && carRef.current) {
      const p = localPlayerRef.current;
      
      // Map 2D (x, y) to 3D (x, 0, z)
      carRef.current.position.set(p.x, 0, p.y);
      
      // Rotation: 2D angle 0 is Right (+X). 3D Box faces +Z.
      // We need to rotate Y.
      // If angle=0, we want car to face +X.
      // Box faces +Z. Rotate Y by +PI/2 faces +X.
      // 2D angle increases clockwise (screen Y down).
      // 3D Y-rotation increases counter-clockwise.
      // So rotation = -angle + PI/2.
      carRef.current.rotation.y = -p.angle + Math.PI/2; 

      // Camera Follow
      const dist = 40;
      const height = 20;
      const angle = p.angle;
      
      // Camera behind car
      // 2D velocity vector is (cos(angle), sin(angle))
      // Camera should be at p - velocity * dist
      const targetCamX = p.x - Math.cos(angle) * dist;
      const targetCamZ = p.y - Math.sin(angle) * dist;
      
      // Smooth camera
      camera.position.lerp(new THREE.Vector3(targetCamX, height, targetCamZ), 0.1);
      camera.lookAt(p.x, 0, p.y);
    }
  });

  return (
    <>
      <ambientLight intensity={1.5} />
      <hemisphereLight skyColor="#ffffff" groundColor="#444444" intensity={1.2} />
      <directionalLight 
        position={[600, 300, 425]} 
        intensity={2.5} 
      />
      
      <TrackMesh />
      
      {/* Decorative Elements */}
      {decorations.map((item, i) => (
        item.type === 'tree' ? (
          <Tree key={i} position={item.pos} scale={item.scale} />
        ) : (
          <Rock key={i} position={item.pos} scale={item.scale} />
        )
      ))}
      
      {/* Local Player */}
      <group ref={carRef}>
        <CarModel color="red" drifting={localPlayerRef.current?.drifting} />
      </group>
    </>
  );
};

export default function GameCanvas() {
  const [laps, setLaps] = useState(0);
  const [bestLapTime, setBestLapTime] = useState<number>(Infinity);
  const [currentLapStart, setCurrentLapStart] = useState<number>(Date.now());
  const [wrongWay, setWrongWay] = useState(false);
  const timerRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const nitroTextRef = useRef<HTMLSpanElement>(null);
  const nitroBarRef = useRef<HTMLDivElement>(null);
  
  // HUD Helper
  const formatTime = (ms: number) => {
      if (ms === Infinity || !ms) return "--:--";
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const rs = s % 60;
      const msPart = Math.floor((ms % 1000) / 10);
      return `${m}:${rs.toString().padStart(2, '0')}.${msPart.toString().padStart(2, '0')}`;
  };
  
  // Local state for smooth physics
  const localPlayer = useRef<{
    x: number;
    y: number;
    angle: number;
    speed: number;
    keys: Record<string, boolean>;
    checkpoint: number; // 0: Start, 1: Top, 2: Bottom
    nitro: number;
    drifting: boolean;
    wrongWayTimer: number | null;
    isWrongWay: boolean;
    lapCount: number;
  }>({
    x: 650,
    y: 750,
    angle: Math.PI,
    speed: 0,
    keys: {},
    checkpoint: 3, // Start in sector 3 (before finish line)
    nitro: 100,
    drifting: false,
    wrongWayTimer: null,
    isWrongWay: false,
    lapCount: 0,
  });

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      localPlayer.current.keys[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      localPlayer.current.keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Physics Loop (runs independently of 3D render loop)
  useEffect(() => {
    let animationFrameId: number;

    const updatePhysics = () => {
      const p = localPlayer.current;
      const oldX = p.x;
      
      // Acceleration
      if (p.keys['ArrowUp'] || p.keys['KeyW']) {
        p.speed += ACCELERATION;
      } else if (p.keys['ArrowDown'] || p.keys['KeyS']) {
        p.speed -= ACCELERATION;
      } else {
        p.speed *= FRICTION;
      }

      // Nitro
      if ((p.keys['ShiftLeft'] || p.keys['ShiftRight']) && p.nitro > 0) {
          p.speed += NITRO_ACCEL;
          p.nitro = Math.max(0, p.nitro - 1);
      } else {
          p.nitro = Math.min(100, p.nitro + 0.2);
      }

      // Drifting Logic
      // Drift if turning + Spacebar OR turning sharply at high speed
      const isTurning = p.keys['ArrowLeft'] || p.keys['KeyA'] || p.keys['ArrowRight'] || p.keys['KeyD'];
      const wantsDrift = p.keys['Space'];
      
      if (wantsDrift && isTurning && Math.abs(p.speed) > 1.5) {
          p.drifting = true;
      } else {
          p.drifting = false;
      }

      // Max Speed Cap
      const isNitroActive = (p.keys['ShiftLeft'] || p.keys['ShiftRight']) && p.nitro > 0;
      const currentMaxSpeed = isNitroActive ? NITRO_SPEED : MAX_SPEED;
      
      if (p.speed > currentMaxSpeed) {
          if (isNitroActive) {
              p.speed = currentMaxSpeed;
          } else {
              // If nitro just ran out or was released, gradually slow down to max speed
              p.speed = Math.max(currentMaxSpeed, p.speed * 0.98);
          }
      }
      if (p.speed < -MAX_SPEED / 2) p.speed = -MAX_SPEED / 2;

      // Turning
      if (Math.abs(p.speed) > 0.1) {
        let turn = TURN_SPEED * (p.speed / MAX_SPEED);
        
        // Enhance turning while drifting
        if (p.drifting) {
            turn *= 1.25; // Sharper turn
            p.speed *= 0.98; // Slight drag while drifting
        }

        if (p.keys['ArrowLeft'] || p.keys['KeyA']) {
          p.angle -= turn;
        }
        if (p.keys['ArrowRight'] || p.keys['KeyD']) {
          p.angle += turn;
        }
      }

      // Movement
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed;

      // Find closest segment for target angle and collision
      let minD2 = Infinity;
      let targetAngle = 0;
      
      TRACK_SEGMENTS.forEach(seg => {
          const pt = getClosestPointOnSegment({x: p.x, y: p.y}, seg.start, seg.end);
          const d2 = (pt.x - p.x)**2 + (pt.y - p.y)**2;
          if (d2 < minD2) {
              minD2 = d2;
              targetAngle = seg.angle;
          }
      });

      // Track Collision (Off-track logic)
      if (Math.sqrt(minD2) > TRACK_RADIUS) {
        // Off-track: Apply heavy friction/slowdown instead of hard wall
        p.speed *= 0.9; // Rapidly slow down
        
        // Cap max speed on grass
        if (p.speed > 1.2) p.speed = 1.2;
        if (p.speed < -0.75) p.speed = -0.75;

        p.drifting = false; // Harder to drift on grass
      }

      // Sector/Lap Logic
      let currentSector = -1;
      const d0 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[0].start, TRACK_SEGMENTS[0].end);
      const d1 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[4].start, TRACK_SEGMENTS[4].end);
      const d2 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[8].start, TRACK_SEGMENTS[8].end);
      const d3 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[11].start, TRACK_SEGMENTS[11].end);

      if (d0 < TRACK_RADIUS * 1.5) currentSector = 0;
      else if (d1 < TRACK_RADIUS * 1.5) currentSector = 1;
      else if (d2 < TRACK_RADIUS * 1.5) currentSector = 2;
      else if (d3 < TRACK_RADIUS * 1.5) currentSector = 3;
      
      // Checkpoint progression
      if (currentSector !== -1) {
          const nextCheckpoint = (p.checkpoint + 1) % 4;
          if (currentSector === nextCheckpoint) {
              p.checkpoint = currentSector;
          }
      }

      // Lap Finish Check (Crossing x=625 on segment 12)
      const onFinishStraight = p.y > 700 && p.y < 800;
      if (p.checkpoint === 3 && onFinishStraight && oldX >= 625 && p.x < 625) {
          const now = Date.now();
          const lapTime = now - currentLapStart;
          
          // Always reset timer for the next lap
          setCurrentLapStart(now);
          
          // Increment internal lap count
          p.lapCount = (p.lapCount || 0) + 1;
          setLaps(p.lapCount);
          
          // Only record best time if this wasn't the start-line crossing (Lap 1 start)
          if (p.lapCount > 1) {
              setBestLapTime(prev => Math.min(prev, lapTime));
          }
          
          // Reset checkpoint for next lap
          p.checkpoint = -1; // Wait for sector 0
      }

      // Wrong Way Detection (Angle based)
      let pAngle = p.angle % (Math.PI * 2);
      if (pAngle > Math.PI) pAngle -= Math.PI * 2;
      if (pAngle < -Math.PI) pAngle += Math.PI * 2;
      
      let diff = Math.abs(pAngle - targetAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      
      const isWrongWayConditionMet = diff > 2.0 && p.speed > 0.5;
      
      if (isWrongWayConditionMet) {
          if (p.wrongWayTimer === null) {
              p.wrongWayTimer = Date.now();
          } else if (Date.now() - p.wrongWayTimer > 100) {
              if (!p.isWrongWay) {
                  p.isWrongWay = true;
                  setWrongWay(true);
              }
          }
      } else {
          p.wrongWayTimer = null;
          if (p.isWrongWay) {
              p.isWrongWay = false;
              setWrongWay(false);
          }
      }

      // Update DOM directly for high-frequency data
      if (speedRef.current) {
          speedRef.current.innerText = Math.round(Math.abs(p.speed) * 60).toString();
      }
      if (nitroTextRef.current && nitroBarRef.current) {
          const nitroRounded = Math.round(p.nitro);
          nitroTextRef.current.innerText = `${nitroRounded}%`;
          nitroBarRef.current.style.width = `${p.nitro}%`;
      }
      if (timerRef.current) {
          timerRef.current.innerText = formatTime(Date.now() - currentLapStart);
      }

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    updatePhysics();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [currentLapStart]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl border-4 border-slate-700">
      <Canvas dpr={1} performance={{ min: 0.5 }}>
        <color attach="background" args={['#0f172a']} />
        <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={60} far={1000} />
        <fog attach="fog" args={['#0f172a', 100, 900]} />
        <GameScene localPlayerRef={localPlayer} />
        <OrbitControls enabled={false} />
      </Canvas>
      
      {/* Top Center: Lap Timer */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-black/50 text-white px-8 py-4 rounded-full border border-white/10 backdrop-blur-md flex items-center gap-8 shadow-lg">
              <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Current</div>
                  <div ref={timerRef} className="text-3xl font-mono font-bold text-yellow-400 leading-none">
                      {formatTime(Date.now() - currentLapStart)}
                  </div>
              </div>
              <div className="w-px h-12 bg-white/20"></div>
              <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Best</div>
                  <div className="text-2xl font-mono text-slate-300 leading-none">
                      {bestLapTime !== Infinity ? formatTime(bestLapTime) : '--:--'}
                  </div>
              </div>
              <div className="w-px h-12 bg-white/20"></div>
               <div className="text-center">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Lap</div>
                  <div className="text-2xl font-mono text-slate-300 leading-none">
                      {laps}
                  </div>
              </div>
          </div>
      </div>

      {/* Bottom Right: Digital Tachymeter */}
      <div className="absolute bottom-6 right-6 pointer-events-none">
          <div className="bg-black/60 p-6 rounded-full border-4 border-slate-800 backdrop-blur-md flex flex-col items-center justify-center w-40 h-40 shadow-[0_0_30px_rgba(0,0,0,0.8)] relative overflow-hidden">
              <div className="absolute inset-0 rounded-full border-4 border-t-yellow-400 border-r-orange-500 border-b-red-500 border-l-transparent opacity-50 animate-[spin_3s_linear_infinite]"></div>
              <div ref={speedRef} className="text-5xl font-black font-mono text-white italic tracking-tighter z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                  0
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-widest font-bold mt-1 z-10">
                  KM/H
              </div>
          </div>
      </div>

      {/* Bottom Center: Nitro Bar */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none w-80">
          <div className="flex justify-between text-xs text-slate-400 uppercase tracking-wider font-bold mb-2">
              <span>Nitro</span>
              <span ref={nitroTextRef}>100%</span>
          </div>
          <div className="w-full h-4 bg-slate-800/50 rounded-full overflow-hidden border border-white/20 backdrop-blur-md">
              <div 
                ref={nitroBarRef}
                className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-300 shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                style={{ width: `100%` }}
              />
          </div>
      </div>

      {/* Wrong Way Warning */}
      {wrongWay && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="bg-red-600/90 text-white px-12 py-8 rounded-2xl border-8 border-white shadow-2xl animate-pulse">
                <div className="text-6xl font-black italic uppercase tracking-widest">WRONG WAY</div>
            </div>
        </div>
      )}

      {/* Bottom Left: Controls (Faded) */}
      <div className="absolute bottom-6 left-6 text-white pointer-events-none opacity-50 hover:opacity-100 transition-opacity duration-300">
        <div className="bg-black/40 p-5 rounded-xl backdrop-blur-md border border-white/10">
            <h3 className="font-bold text-sm mb-2 text-yellow-400/80">Controls</h3>
            <ul className="text-xs space-y-1 font-mono text-slate-300">
            <li>W / UP : Accelerate</li>
            <li>S / DOWN : Brake</li>
            <li>A / D  : Turn</li>
            <li>SPACE  : Drift</li>
            <li>SHIFT  : Nitro</li>
            </ul>
        </div>
      </div>
    </div>
  );
}
