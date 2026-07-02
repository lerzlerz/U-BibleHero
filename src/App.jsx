import React, { useState, useEffect, useRef, useCallback } from 'react';
import questionsData from './data/questions.json';
import profilesData from './data/profiles.json';
import './App.css';

// ----------------------------------------------------
// 1. GAME MAP SETUP
// ----------------------------------------------------
const MAP_SIZE = 20;
const TILE_SIZE = 40; // Pixels per tile

// Streets configuration (walkable horizontal and vertical corridors - 2 tiles wide)
const STREETS = [2, 3, 6, 7, 10, 11, 14, 15, 17, 18];

// Map codes: 0 = Path, 1 = Tree/Obstacle, 2 = NPC, 5 = Gate
const INITIAL_MAP = Array(MAP_SIZE).fill(null).map(() => Array(MAP_SIZE).fill(1));

// Make corridors walkable
for (let r = 0; r < MAP_SIZE; r++) {
  for (let c = 0; c < MAP_SIZE; c++) {
    if (STREETS.includes(r) || STREETS.includes(c)) {
      INITIAL_MAP[r][c] = 0;
    }
  }
}

// Add outer walls
for (let i = 0; i < MAP_SIZE; i++) {
  INITIAL_MAP[0][i] = 1;
  INITIAL_MAP[MAP_SIZE - 1][i] = 1;
  INITIAL_MAP[i][0] = 1;
  INITIAL_MAP[i][MAP_SIZE - 1] = 1;
}

// Place 20 NPCs in alcoves right next to streets (where the wall is)
const NPC_POSITIONS = [
  { r: 1, c: 2, emoji: '🧙' },  { r: 1, c: 6, emoji: '🧚' },  { r: 1, c: 10, emoji: '🧜' }, { r: 1, c: 14, emoji: '🦄' }, { r: 1, c: 18, emoji: '🦉' },
  { r: 5, c: 2, emoji: '🧔' },  { r: 5, c: 6, emoji: '👵' },  { r: 5, c: 10, emoji: '👲' }, { r: 5, c: 14, emoji: '👸' }, { r: 5, c: 18, emoji: '👩' },
  { r: 9, c: 2, emoji: '🗿' },  { r: 9, c: 6, emoji: '🦁' },  { r: 9, c: 10, emoji: '🦊' }, { r: 9, c: 14, emoji: '🐼' }, { r: 9, c: 18, emoji: '🐨' },
  { r: 13, c: 2, emoji: '🐝' }, { r: 13, c: 6, emoji: '🦋' }, { r: 13, c: 10, emoji: '🐬' }, { r: 13, c: 14, emoji: '🐢' }, { r: 13, c: 18, emoji: '🦖' }
];

// Write NPCs into map grid
NPC_POSITIONS.forEach((pos) => {
  INITIAL_MAP[pos.r][pos.c] = 2;
});

// Place Locked Temple Gate at (17, 18) - alcove below the bottom-right street
INITIAL_MAP[17][18] = 5;

// Player starts at (2, 2) street intersection
const PLAYER_START = { r: 2, c: 2 };

// ----------------------------------------------------
// 2. PERSONALITY CALCULATION ENGINE
// ----------------------------------------------------
function getProfileCode(d, i, s, c) {
  const scores = [
    { trait: 'D', val: d },
    { trait: 'I', val: i },
    { trait: 'S', val: s },
    { trait: 'C', val: c }
  ];
  
  // Sort descending
  scores.sort((a, b) => b.val - a.val);
  
  const t1 = scores[0];
  const t2 = scores[1];
  const t3 = scores[2];
  const t4 = scores[3];
  
  // Rule 1: Pure dominant trait
  if (t1.val - t2.val >= 6 || t2.val < 8) {
    return t1.trait;
  }
  
  // Rule 2: Three-letter profile
  if (t2.val - t3.val <= 3 && t3.val >= 7) {
    const top3 = new Set([t1.trait, t2.trait, t3.trait]);
    if (top3.has('S') && top3.has('C') && top3.has('D')) {
      if (t1.trait === 'S') return 'S/C/D';
      return 'C/S/D';
    }
    if (top3.has('C') && top3.has('S') && top3.has('I')) {
      return 'C/S/I';
    }
  }
  
  // Rule 3: Two-letter profile
  const combo = `${t1.trait}/${t2.trait}`;
  const validCombos = ['D/I', 'D/S', 'D/C', 'I/D', 'I/S', 'I/C', 'S/D', 'S/I', 'C/S'];
  if (validCombos.includes(combo)) {
    return combo;
  }
  
  // Map non-standard combinations to nearest equivalents
  if (combo === 'C/D') return 'D/C';
  if (combo === 'C/I') return 'I/C';
  if (combo === 'S/C') return 'C/S';
  
  // Ultimate fallback
  return t1.trait;
}

const CHARACTER_AVATARS = {
  "所罗门": "👑",
  "约书亚、撒拉": "⚔️",
  "亚波罗、司提反": "📜",
  "保罗": "⛺",
  "扫罗王、亚伦": "🎺",
  "彼得、利百加": "🌊",
  "巴拿巴、亚比该": "🕊️",
  "大卫": "🎵",
  "以撒、多加": "🐑",
  "尼希米、约瑟、马大": "🧱",
  "亚伯拉罕、哈拿": "🏕️",
  "雅各": "🤼",
  "路加、以斯帖": "🩺",
  "摩西、多马": "⚡",
  "以利亚": "🔥",
  "使徒约翰、马利亚": "📖"
};

// ----------------------------------------------------
// 3. MAIN REACT COMPONENT
// ----------------------------------------------------
export default function App() {
  const [gameState, setGameState] = useState('start'); // start | playing | results
  
  // Answers database: keys 1 to 40, values D/I/S/C
  const [answers, setAnswers] = useState({});
  const [resolvedNpcs, setResolvedNpcs] = useState(new Set());
  
  // Interaction overlay state
  const [currentDialogueNpc, setCurrentDialogueNpc] = useState(null);
  const [dialogueStep, setDialogueStep] = useState(0); // 0 = first question, 1 = second question
  const [activeDialogueQ1, setActiveDialogueQ1] = useState(null);
  const [activeDialogueQ2, setActiveDialogueQ2] = useState(null);
  const [adjacentNpc, setAdjacentNpcState] = useState(null);
  
  // Player continuous physics coordinates (pixel-based, starting at 100, 100 which is grid [2, 2])
  const playerPosRef = useRef({ x: 100, y: 100 });
  const vxRef = useRef(0);
  const vyRef = useRef(0);
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const targetPosRef = useRef(null);
  const adjacentNpcStateRef = useRef(null);
  
  // Results profile state
  const [resultsProfile, setResultsProfile] = useState(null);
  
  // Canvas & animation refs
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  
  // Fireflies list
  const firefliesRef = useRef([]);

  // Initialize fireflies once
  useEffect(() => {
    const list = [];
    for (let i = 0; i < 30; i++) {
      list.push({
        x: Math.random() * MAP_SIZE * TILE_SIZE,
        y: Math.random() * MAP_SIZE * TILE_SIZE,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2 + 1,
        alpha: Math.random() * 0.5 + 0.3,
        alphaSpeed: (Math.random() - 0.5) * 0.02
      });
    }
    firefliesRef.current = list;
  }, []);

  // Reset all game data
  const handleRestart = () => {
    playerPosRef.current = { x: 100, y: 100 };
    vxRef.current = 0;
    vyRef.current = 0;
    keysRef.current = { up: false, down: false, left: false, right: false };
    targetPosRef.current = null;
    adjacentNpcStateRef.current = null;
    setAnswers({});
    setResolvedNpcs(new Set());
    setCurrentDialogueNpc(null);
    setDialogueStep(0);
    setActiveDialogueQ1(null);
    setActiveDialogueQ2(null);
    setAdjacentNpcState(null);
    setResultsProfile(null);
    setGameState('start');
  };

  // Start the Labyrinth journey
  const handleStartGame = () => {
    setGameState('playing');
  };

  // Calculate final score and character profile
  const handleCompleteTest = useCallback(() => {
    let d = 0, i = 0, s = 0, c = 0;
    Object.values(answersRef.current).forEach((type) => {
      if (type === 'D') d++;
      else if (type === 'I') i++;
      else if (type === 'S') s++;
      else if (type === 'C') c++;
    });

    // Gamified Behavioral Observation
    const finalResolvedCount = resolvedNpcsRef.current.size;
    let finalD = d;
    let finalI = i;
    let finalS = s;
    let finalC = c;
    let styleText = '';
    let styleDesc = '';
    
    if (finalResolvedCount === 20) {
      finalC += 2; // Perfectionist collection awards compliance/conscientiousness points
      finalS += 1; // Patience awards steadiness points
      styleText = '完美主义探索者 (高 C/S 特质倾向)';
      styleDesc = '你在已达成 80% 通关条件的情况下，依然选择探索整片迷宫，将 20 位导引者的题目全部完美答完。这展现了你做事有始有终、追求圆满、细致严谨且有强烈的规则与秩序感。';
    } else {
      styleText = '效率导向探索者 (高 D/I 特质倾向)';
      styleDesc = '你在达成 80% 通关门槛后，敏捷地做出决策直接前往圣殿结算。这体现了你非常务实、目标感强、结果优先且不过度拘泥细节的果断作风，极具执行效率。';
    }

    const code = getProfileCode(finalD, finalI, finalS, finalC);
    const profile = profilesData.find(p => p.code === code) || profilesData[0];
    
    setResultsProfile({
      ...profile,
      scores: { D: finalD, I: finalI, S: finalS, C: finalC },
      avatar: CHARACTER_AVATARS[profile.name] || '👤',
      explorationStyle: styleText,
      explorationDesc: styleDesc
    });
    setGameState('results');
  }, []);

  // Check if player is standing close to any NPC (distance-based in pixel coordinates)
  const checkAdjacentNpc = useCallback((px, py) => {
    for (let i = 0; i < NPC_POSITIONS.length; i++) {
      const npc = NPC_POSITIONS[i];
      const npcX = npc.c * TILE_SIZE + TILE_SIZE / 2;
      const npcY = npc.r * TILE_SIZE + TILE_SIZE / 2;
      const dist = Math.hypot(px - npcX, py - npcY);
      if (dist < 55) { // 55 pixels is perfect for close interaction range
        return {
          index: i,
          r: npc.r,
          c: npc.c,
          emoji: npc.emoji
        };
      }
    }
    return null;
  }, []);

  // Trigger Interaction with NPC
  const interactWithNpc = useCallback(() => {
    if (gameState !== 'playing' || currentDialogueNpc !== null) return;
    const adj = checkAdjacentNpc(playerPosRef.current.x, playerPosRef.current.y);
    if (adj && !resolvedNpcs.has(adj.index)) {
      // Dynamic Question Pool: Draw a random unanswered strength and weakness question
      const unansweredQ1s = questionsData.slice(0, 20).filter(q => !answers[q.id]);
      const q1 = unansweredQ1s[Math.floor(Math.random() * unansweredQ1s.length)] || questionsData[0];
      
      const unansweredQ2s = questionsData.slice(20, 40).filter(q => !answers[q.id]);
      const q2 = unansweredQ2s[Math.floor(Math.random() * unansweredQ2s.length)] || questionsData[20];
      
      setActiveDialogueQ1(q1);
      setActiveDialogueQ2(q2);
      setCurrentDialogueNpc(adj);
      setDialogueStep(0);
    }
  }, [gameState, currentDialogueNpc, resolvedNpcs, checkAdjacentNpc, answers]);

  // Cheat code: Randomly answer exactly ONE question
  const handleCheatRandomOneAnswer = useCallback(() => {
    // 1. If in a dialogue, answer the current active question randomly
    if (currentDialogueNpc !== null && activeDialogueQ1 && activeDialogueQ2) {
      const types = ['D', 'I', 'S', 'C'];
      const selectedType = types[Math.floor(Math.random() * 4)];
      const activeQ = dialogueStep === 0 ? activeDialogueQ1 : activeDialogueQ2;
      
      setAnswers(prev => ({ ...prev, [activeQ.id]: selectedType }));
      
      if (dialogueStep === 0) {
        setDialogueStep(1);
      } else {
        const npcIdx = currentDialogueNpc.index;
        setResolvedNpcs(prev => {
          const next = new Set(prev);
          next.add(npcIdx);
          return next;
        });
        setCurrentDialogueNpc(null);
        setDialogueStep(0);
        setActiveDialogueQ1(null);
        setActiveDialogueQ2(null);
      }
      return;
    }
    
    // 2. If wandering, pick a random unanswered question from the database
    const unansweredIds = [];
    for (let qId = 1; qId <= 40; qId++) {
      if (!answers[qId]) {
        unansweredIds.push(qId);
      }
    }
    
    if (unansweredIds.length === 0) return;
    
    const randQId = unansweredIds[Math.floor(Math.random() * unansweredIds.length)];
    const types = ['D', 'I', 'S', 'C'];
    const randType = types[Math.floor(Math.random() * 4)];
    
    setAnswers(prev => ({ ...prev, [randQId]: randType }));
    
    // Resolve a random unresolved NPC to show visual progress
    const unresolvedNpcIndices = [];
    for (let i = 0; i < 20; i++) {
      if (!resolvedNpcs.has(i)) {
        unresolvedNpcIndices.push(i);
      }
    }
    
    if (unresolvedNpcIndices.length > 0) {
      const randNpcIdx = unresolvedNpcIndices[Math.floor(Math.random() * unresolvedNpcIndices.length)];
      setResolvedNpcs(prev => {
        const next = new Set(prev);
        next.add(randNpcIdx);
        return next;
      });
    }
  }, [answers, currentDialogueNpc, dialogueStep, activeDialogueQ1, activeDialogueQ2, resolvedNpcs]);
  // Listen to Keyboard Inputs
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') return;
      
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          keysRef.current.up = true;
          targetPosRef.current = null; // Keyboard overrides mouse click
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          keysRef.current.down = true;
          targetPosRef.current = null;
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          keysRef.current.left = true;
          targetPosRef.current = null;
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          keysRef.current.right = true;
          targetPosRef.current = null;
          e.preventDefault();
          break;
        case ' ':
        case 'e':
        case 'E':
          e.preventDefault();
          if (currentDialogueNpc === null) {
            interactWithNpc();
          }
          break;
        case 't':
        case 'T':
          e.preventDefault();
          handleCheatRandomOneAnswer();
          break;
        case 'Escape':
        case 'q':
        case 'Q':
          if (currentDialogueNpc !== null) {
            e.preventDefault();
            setCurrentDialogueNpc(null);
            setDialogueStep(0);
            setActiveDialogueQ1(null);
            setActiveDialogueQ2(null);
          }
          break;
        default:
          break;
      }
    };
    
    const handleKeyUp = (e) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          keysRef.current.up = false;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          keysRef.current.down = false;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          keysRef.current.left = false;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          keysRef.current.right = false;
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, currentDialogueNpc, interactWithNpc, handleCheatRandomOneAnswer]);

  // Click on map to move (touch-friendly mouse navigation)
  const handleCanvasClick = (e) => {
    if (gameState !== 'playing' || currentDialogueNpc !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    targetPosRef.current = { x: clickX, y: clickY };
  };

  // Canvas loop synchronization refs to prevent stale closure states
  const answersRef = useRef(answers);
  const resolvedNpcsRef = useRef(resolvedNpcs);
  const handleCompleteTestRef = useRef(handleCompleteTest);
  
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    resolvedNpcsRef.current = resolvedNpcs;
  }, [resolvedNpcs]);

  useEffect(() => {
    handleCompleteTestRef.current = handleCompleteTest;
  }, [handleCompleteTest]);

  // Canvas Anim/Render Loop
  useEffect(() => {
    if (gameState !== 'playing') {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const loop = () => {
      // ----------------------------------------------------
      // 1. UPDATE PLAYER PHYSICS (Velocity, Acceleration, Deceleration)
      // ----------------------------------------------------
      let ax = 0;
      let ay = 0;
      
      // Check keyboard
      if (keysRef.current.up) ay -= 1;
      if (keysRef.current.down) ay += 1;
      if (keysRef.current.left) ax -= 1;
      if (keysRef.current.right) ax += 1;
      
      // Check mouse target steering
      if (ax === 0 && ay === 0 && targetPosRef.current) {
        const dx = targetPosRef.current.x - playerPosRef.current.x;
        const dy = targetPosRef.current.y - playerPosRef.current.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 4) {
          targetPosRef.current = null;
          vxRef.current = 0;
          vyRef.current = 0;
        } else {
          const angle = Math.atan2(dy, dx);
          ax = Math.cos(angle);
          ay = Math.sin(angle);
        }
      }
      
      // Normalize diagonal acceleration
      if (ax !== 0 && ay !== 0) {
        ax *= 0.7071;
        ay *= 0.7071;
      }
      
      // Apply forces (smooth sliding acceleration & slower max speed)
      const accRate = 0.12; // Lower acceleration for a smoother glide
      const friction = 0.85; // Slide friction
      const maxSpeed = 1.8; // Max speed is 1.8 pixels/frame (slower and more controllable)
      
      if (ax !== 0) {
        vxRef.current += ax * accRate;
      } else {
        vxRef.current *= friction;
      }
      
      if (ay !== 0) {
        vyRef.current += ay * accRate;
      } else {
        vyRef.current *= friction;
      }
      
      // Limit speed
      const currentSpeed = Math.hypot(vxRef.current, vyRef.current);
      if (currentSpeed > maxSpeed) {
        vxRef.current = (vxRef.current / currentSpeed) * maxSpeed;
        vyRef.current = (vyRef.current / currentSpeed) * maxSpeed;
      }
      
      // Zero out tiny values
      if (Math.abs(vxRef.current) < 0.05) vxRef.current = 0;
      if (Math.abs(vyRef.current) < 0.05) vyRef.current = 0;
      
      // ----------------------------------------------------
      // 2. TILE COLLISION DETECTION & SLIDING RESOLUTION
      // ----------------------------------------------------
      const checkCollision = (x, y) => {
        const pr = 9; // Slightly smaller player radius (9px) prevents getting stuck in 2-tile wide corridors
        const left = x - pr;
        const right = x + pr;
        const top = y - pr;
        const bottom = y + pr;
        
        const startCol = Math.floor(left / TILE_SIZE);
        const endCol = Math.floor(right / TILE_SIZE);
        const startRow = Math.floor(top / TILE_SIZE);
        const endRow = Math.floor(bottom / TILE_SIZE);
        
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            if (r < 0 || r >= MAP_SIZE || c < 0 || c >= MAP_SIZE) {
              return true; // Out of bounds is solid
            }
            const tile = INITIAL_MAP[r][c];
            let isSolid = false;
            
            if (tile === 1) {
              isSolid = true; // Tree wall
            } else if (tile === 5) {
              // Locked gate (solid if solved NPC count < 16)
              if (resolvedNpcsRef.current.size < 16) {
                isSolid = true;
              }
            } else if (tile === 2) {
              // Unresolved NPC is solid
              const npcIndex = NPC_POSITIONS.findIndex(n => n.r === r && n.c === c);
              if (npcIndex !== -1 && !resolvedNpcsRef.current.has(npcIndex)) {
                isSolid = true;
              }
            }
            
            if (isSolid) return true;
          }
        }
        return false;
      };
      
      let px = playerPosRef.current.x;
      let py = playerPosRef.current.y;
      
      // Resolve X axis
      let nextX = px + vxRef.current;
      if (!checkCollision(nextX, py)) {
        px = nextX;
      } else {
        vxRef.current = 0;
        targetPosRef.current = null;
      }
      
      // Resolve Y axis
      let nextY = py + vyRef.current;
      if (!checkCollision(px, nextY)) {
        py = nextY;
      } else {
        vyRef.current = 0;
        targetPosRef.current = null;
      }
      
      playerPosRef.current.x = px;
      playerPosRef.current.y = py;
      
      // Check if we hit the portal
      if (resolvedNpcsRef.current.size >= 16) {
        const portalX = 18 * 40 + 20;
        const portalY = 17 * 40 + 20;
        const distToPortal = Math.hypot(px - portalX, py - portalY);
        if (distToPortal < 25) {
          handleCompleteTestRef.current();
        }
      }
      
      // Dynamically update the adjacent NPC status for prompt
      const adj = checkAdjacentNpc(px, py);
      if (adj) {
        if (!adjacentNpcStateRef.current || adjacentNpcStateRef.current.index !== adj.index) {
          adjacentNpcStateRef.current = adj;
          setAdjacentNpcState(adj);
        }
      } else {
        if (adjacentNpcStateRef.current !== null) {
          adjacentNpcStateRef.current = null;
          setAdjacentNpcState(null);
        }
      }
      
      // ----------------------------------------------------
      // 3. CLEAR CANVAS & DRAW MAP
      // ----------------------------------------------------
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let r = 0; r < MAP_SIZE; r++) {
        for (let c = 0; c < MAP_SIZE; c++) {
          const tile = INITIAL_MAP[r][c];
          const tx = c * TILE_SIZE;
          const ty = r * TILE_SIZE;
          
          if (tile === 1) {
            ctx.fillStyle = '#0f241a';
            ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
            ctx.font = '22px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🌲', tx + TILE_SIZE/2, ty + TILE_SIZE/2);
          } else {
            ctx.fillStyle = '#17271e';
            ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
            
            if ((r + c) % 5 === 0) {
              ctx.fillStyle = '#1c3327';
              ctx.fillRect(tx + 5, ty + 10, 4, 4);
              ctx.fillRect(tx + 28, ty + 24, 4, 4);
            }
          }
          
          if (tile === 5) {
            ctx.fillStyle = '#17271e';
            ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (resolvedNpcsRef.current.size >= 16) {
              ctx.fillText('🌟', tx + TILE_SIZE/2, ty + TILE_SIZE/2);
            } else {
              ctx.fillText('🚪', tx + TILE_SIZE/2, ty + TILE_SIZE/2);
            }
          }
        }
      }
      
      // ----------------------------------------------------
      // 4. DRAW NPCS
      // ----------------------------------------------------
      NPC_POSITIONS.forEach((npc, index) => {
        const tx = npc.c * TILE_SIZE;
        const ty = npc.r * TILE_SIZE;
        const isResolved = resolvedNpcsRef.current.has(index);
        
        ctx.save();
        if (isResolved) {
          ctx.strokeStyle = 'rgba(82, 183, 136, 0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(tx + TILE_SIZE/2, ty + TILE_SIZE/2, TILE_SIZE/2 - 2, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.font = '16px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🕯️', tx + TILE_SIZE/2, ty + TILE_SIZE/2);
        } else {
          ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#60a5fa';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(tx + TILE_SIZE/2, ty + TILE_SIZE/2, TILE_SIZE/2 - 4, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.font = '22px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(npc.emoji, tx + TILE_SIZE/2, ty + TILE_SIZE/2);
        }
        ctx.restore();
      });
      
      // ----------------------------------------------------
      // 5. UPDATE AND DRAW FIREFLIES
      // ----------------------------------------------------
      ctx.save();
      firefliesRef.current.forEach((ff) => {
        ff.x += ff.vx;
        ff.y += ff.vy;
        
        if (ff.x < 0) ff.x = MAP_SIZE * TILE_SIZE;
        if (ff.x > MAP_SIZE * TILE_SIZE) ff.x = 0;
        if (ff.y < 0) ff.y = MAP_SIZE * TILE_SIZE;
        if (ff.y > MAP_SIZE * TILE_SIZE) ff.y = 0;
        
        ff.alpha += ff.alphaSpeed;
        if (ff.alpha < 0.1 || ff.alpha > 0.8) ff.alphaSpeed = -ff.alphaSpeed;
        
        const dist = Math.hypot(ff.x - px, ff.y - py);
        if (dist < 200) {
          ctx.fillStyle = `rgba(250, 240, 150, ${ff.alpha})`;
          ctx.beginPath();
          ctx.arc(ff.x, ff.y, ff.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
      
      // ----------------------------------------------------
      // 6. DRAW PLAYER
      // ----------------------------------------------------
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 183, 3, 0.9)';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ffb703';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, TILE_SIZE/2 - 6, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚶', px, py);
      ctx.restore();
      
      // ----------------------------------------------------
      // 7. LIGHT MASK (Fog of War: reduced density & larger circle radius)
      // ----------------------------------------------------
      ctx.save();
      ctx.fillStyle = 'rgba(6, 11, 8, 0.82)'; // Reduced mask opacity from 0.97 to 0.82
      
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      
      ctx.arc(px, py, 145, 0, Math.PI * 2, true); // Increased light radius from 110 to 145
      
      ctx.fill();
      ctx.restore();
      
      requestRef.current = requestAnimationFrame(loop);
    };
    
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameState]);

  // Get current active question for Dialogue Card
  const activeQuestion = currentDialogueNpc !== null 
    ? (dialogueStep === 0 ? activeDialogueQ1 : activeDialogueQ2)
    : null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      
      {/* ----------------- START SCREEN ----------------- */}
      {gameState === 'start' && (
        <div className="start-screen">
          <div className="start-title">心灵迷宫</div>
          <div className="start-subtitle">属灵性格探索</div>
          <p className="start-desc">
            欢迎来到心灵迷宫！你将扮演一位探索者，在静谧的圣所迷雾中漫游。
            林中散布着 20 位**心灵导引者**。每遇见一位导引者，他将向你提出两道关于性格的深度抉择（优势与缺点）。
            我们采用**最少维度补偿动态题库**，确保你的每一次选择，都在为你精准构筑真实的灵魂图谱，在心灵的探索之旅中发现匹配自己性格的圣经人物。
          </p>
          
          <div className="instructions-grid">
            <div className="instruction-card">
              <div className="instruction-emoji">🚶</div>
              <h3>键盘漫游</h3>
              <p>使用 <strong>W/A/S/D</strong> 或 <strong>方向键</strong> 操控角色进行平顺的物理滑行移动，或直接点击地面目的地移动。</p>
            </div>
            <div className="instruction-card">
              <div className="instruction-emoji">🔮</div>
              <h3>探索答题</h3>
              <p>寻找林中发光的 20 个 <strong>水晶球（NPC）</strong>，靠近时按 <strong>空格键（SPACE）</strong> 或 <strong>E 键</strong> 开启心灵对话。</p>
            </div>
            <div className="instruction-card">
              <div className="instruction-emoji">🚪</div>
              <h3>终点之门</h3>
              <p>只需解答完 16 位导引者 (80% 探索进度) 后，迷宫底部的 <strong>传送门</strong> 将会开启，带你揭示匹配你性格的圣经人物画像。</p>
            </div>
          </div>
          
          <button className="btn-primary" onClick={handleStartGame}>开启心灵探索</button>
        </div>
      )}

      {/* ----------------- MAIN GAME SCREEN ----------------- */}
      {gameState === 'playing' && (
        <div className="game-container">
          
          {/* HUD Sidebar */}
          <div className="hud-sidebar">
            <div className="hud-header">
              <h2>心灵探索之林</h2>
              <p>探索 80% 导引者即可点亮传送门</p>
            </div>
            
            <div className="stats-panel">
              <div className="stat-row">
                <span className="stat-label">已探索导引者：</span>
                <span className="stat-value highlight">{resolvedNpcs.size} / 16</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">完成答题：</span>
                <span className="stat-value">{Object.keys(answers).length} / 32</span>
              </div>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${Math.min(100, (resolvedNpcs.size / 16) * 100)}%` }}
                ></div>
              </div>
              
              {/* NPC Slots Grid */}
              <div className="npc-slots-grid">
                {NPC_POSITIONS.map((npc, idx) => {
                  const isResolved = resolvedNpcs.has(idx);
                  return (
                    <div 
                      key={idx} 
                      className={`npc-slot ${isResolved ? 'active' : 'inactive'}`}
                      title={`导引者 ${idx + 1}: ${npc.emoji}`}
                    >
                      <span className="npc-slot-emoji">{npc.emoji}</span>
                    </div>
                  );
                })}
              </div>
              
              <div className="stat-row" style={{ marginTop: '20px' }}>
                <span className="stat-label">传送门点亮状态：</span>
                <span className="stat-value" style={{ color: resolvedNpcs.size >= 16 ? 'var(--gold)' : 'var(--text-secondary)' }}>
                  {resolvedNpcs.size >= 16 ? '🌟 已点亮 (前往右下角)' : '🔒 未唤醒'}
                </span>
              </div>
              
              {resolvedNpcs.size >= 16 && (
                <div className={`temple-unlocked-card ${resolvedNpcs.size === 20 ? 'perfect' : 'basic'}`}>
                  {resolvedNpcs.size === 20 ? (
                    <>
                      <strong>🏆 100% 探索圆满达成！</strong>
                      <p>恭喜你在心灵的探索之旅中发现了匹配自己性格的圣经人物！完美的灵魂图谱已拼合，请前往右下角 🌟 查看你的属灵性格报告。</p>
                    </>
                  ) : (
                    <>
                      <strong>✨ 终点传送门已点亮！</strong>
                      <p>恭喜你在心灵的探索之旅中发现了匹配自己性格的圣经人物！你可以随时前往右下角 🌟 查看结果，也可以继续探索森林以获得更详尽的性格分析。</p>
                    </>
                  )}
                </div>
              )}
            </div>
            
            <div className="controls-hint">
              <strong>[控制指南]</strong><br />
              • <strong>移动</strong>：W/A/S/D 或 方向键<br />
              • <strong>交互</strong>：站在 NPC 身边时按 <strong>空格键 (Space)</strong> 或 <strong>E 键</strong><br />
              • <strong>关闭对话</strong>：按键盘 <strong>Esc 键</strong> 或 <strong>Q 键</strong> 退出对话。<br />
              • <strong>随机答题</strong>：按键盘 <strong>T 键</strong> 随机回答当前/后台一道题。<br />
              • <strong>触摸</strong>：在屏幕上直接点击目的地即可移动。
            </div>
            
            <button className="restart-btn" onClick={handleRestart}>重新开始</button>
          </div>
          
          {/* Canvas Viewport */}
          <div className="canvas-wrapper">
            <canvas 
              ref={canvasRef} 
              width={MAP_SIZE * TILE_SIZE} 
              height={MAP_SIZE * TILE_SIZE}
              onClick={handleCanvasClick}
            ></canvas>
            
            {/* Interaction Prompt Floating Indicator */}
            {adjacentNpc && !resolvedNpcs.has(adjacentNpc.index) && (
              <div className="interaction-prompt">
                <span>{adjacentNpc.emoji}</span>
                <span>按 <strong>SPACE</strong> 开启心灵对话</span>
              </div>
            )}
          </div>
          
          {/* ----------------- DIALOGUE/QUESTION OVERLAY ----------------- */}
          {currentDialogueNpc !== null && activeQuestion && (
            <div className="dialog-overlay">
              <div className="dialog-card">
                <button className="dialog-close-btn" onClick={() => { setCurrentDialogueNpc(null); setDialogueStep(0); setActiveDialogueQ1(null); setActiveDialogueQ2(null); }}>✕</button>
                <div className="dialog-progress">
                  导引者 {currentDialogueNpc.index + 1} / 20 • 抉择 {dialogueStep + 1} / 2
                </div>
                <div className="dialog-npc-header">
                  <span className="dialog-npc-avatar">{currentDialogueNpc.emoji}</span>
                  <h3 className="dialog-npc-name">
                    {dialogueStep === 0 ? "优势特质探索" : "压力特质探索"}
                  </h3>
                </div>
                <p className="dialog-question-text">
                  在以下描述中，选出一个<strong>最符合你的第一印象</strong>或<strong>童年倾向</strong>的选择：
                </p>
                <div className="options-list">
                  {activeQuestion.options.map((opt, oIdx) => (
                    <button 
                      key={oIdx} 
                      className="option-button"
                      onClick={() => handleAnswerQuestion(opt.type)}
                    >
                      <span className="option-letter">
                        {String.fromCharCode(65 + oIdx)}
                      </span>
                      <span>{opt.text}</span>
                    </button>
                  ))}
                </div>
                
                <button className="dialog-cheat-btn" onClick={handleCheatRandomOneAnswer}>
                  🪄 随机回答这题 (跳过)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- RESULTS SCREEN ----------------- */}
      {gameState === 'results' && resultsProfile && (
        <div className="results-screen">
          <div style={{ fontFamily: 'Cinzel', color: 'var(--gold)', fontSize: '2.5rem', marginBottom: '30px', textShadow: '0 0 10px rgba(255,183,3,0.3)' }}>
            属灵性格探索报告
          </div>
          
          <div className="results-container">
            {/* Left Card: Dynamic Identity Portrait */}
            <div className="identity-card">
              <div className="card-gold-frame"></div>
              <div className="profile-card-header">Spiritual Character Profile</div>
              <div className="character-avatar-wrap">
                <span className="character-avatar">{resultsProfile.avatar}</span>
              </div>
              <h2 className="character-name">{resultsProfile.name}</h2>
              <div className="character-title">{resultsProfile.title}</div>
              <div className="character-type-badge">DISC：{resultsProfile.code}</div>
              
              <div className="disc-radar-summary">
                <div className="disc-score-box">
                  <span className="disc-score-letter d-color">D</span>
                  <span className="disc-score-val">{resultsProfile.scores.D} / 40</span>
                </div>
                <div className="disc-score-box">
                  <span className="disc-score-letter i-color">I</span>
                  <span className="disc-score-val">{resultsProfile.scores.I} / 40</span>
                </div>
                <div className="disc-score-box">
                  <span className="disc-score-letter s-color">S</span>
                  <span className="disc-score-val">{resultsProfile.scores.S} / 40</span>
                </div>
                <div className="disc-score-box">
                  <span className="disc-score-letter c-color">C</span>
                  <span className="disc-score-val">{resultsProfile.scores.C} / 40</span>
                </div>
              </div>
            </div>
            
            {/* Right Card: Detail Panels */}
            <div className="profile-details">
              <div className="details-header">
                <h3>性格特性与属灵解析</h3>
                <p>恭喜你在心灵的探索之旅中，发现了匹配自己性格的圣经人物！以下是为你生成的属灵性格分析报告：</p>
              </div>
              
              <div className="details-grid">
                <div className="detail-section">
                  <div className="detail-icon-box">🎯</div>
                  <div className="detail-content">
                    <h4>基本动机 (Motivation)</h4>
                    <p>{resultsProfile.motivation}</p>
                  </div>
                </div>
                
                <div className="detail-section">
                  <div className="detail-icon-box">🌟</div>
                  <div className="detail-content">
                    <h4>个人恩赐与事奉偏向 (Gifts & Ministry)</h4>
                    <p>
                      <strong>潜在恩赐：</strong>{resultsProfile.spiritualGifts}<br />
                      <strong>行为优势：</strong>{resultsProfile.gift}
                    </p>
                  </div>
                </div>
                
                <div className="detail-section">
                  <div className="detail-icon-box">😰</div>
                  <div className="detail-content">
                    <h4>内在恐惧 (Fear)</h4>
                    <p>{resultsProfile.fear}</p>
                  </div>
                </div>
                
                <div className="detail-section">
                  <div className="detail-icon-box">🚀</div>
                  <div className="detail-content">
                    <h4>盲点突破与成长方向 (Breakthrough)</h4>
                    <p>{resultsProfile.breakthrough}</p>
                  </div>
                </div>
              </div>
              
              {/* Behavioral Observation */}
              <div className="behavioral-observation-card">
                <div className="behavioral-icon-box">🧭</div>
                <div className="behavioral-content">
                  <h4>探索行为观测 (Exploration Observation)</h4>
                  <div className="behavioral-style-title">{resultsProfile.explorationStyle}</div>
                  <p>{resultsProfile.explorationDesc}</p>
                </div>
              </div>
              
              <div className="results-footer">
                <button className="btn-secondary" onClick={handleRestart}>重新探索迷宫</button>
                <button className="btn-primary" onClick={() => window.print()}>打印结果卡</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
