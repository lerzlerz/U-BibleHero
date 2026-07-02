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
  const [startStep, setStartStep] = useState(0); // 4-step welcome pagination
  
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
  
  // Mobile gestures & camera offsets
  const isDraggingRef = useRef(false);
  const lastTouchPosRef = useRef({ x: 0, y: 0 });
  const cameraOffsetRef = useRef({ x: 0, y: 0 });
  const lastClickTimeRef = useRef(0);
  
  // Mobile auto-trigger on contact refs
  const lastTriggeredNpcIdxRef = useRef(-1);
  const currentDialogueNpcRef = useRef(null);
  const triggerNpcDialogueRef = useRef(null);
  
  // Mobile confirm interaction popup state & refs
  const [mobileInteractTarget, setMobileInteractTarget] = useState(null);
  const mobileInteractTargetRef = useRef(null);
  const dismissedNpcRef = useRef(-1);
  
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
    setStartStep(0);
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
  // Auto trigger dialogue for mobile on contact
  const triggerNpcDialogue = useCallback((adj) => {
    if (gameState !== 'playing') return;
    const unansweredQ1s = questionsData.slice(0, 20).filter(q => !answersRef.current[q.id]);
    const q1 = unansweredQ1s[Math.floor(Math.random() * unansweredQ1s.length)] || questionsData[0];
    
    const unansweredQ2s = questionsData.slice(20, 40).filter(q => !answersRef.current[q.id]);
    const q2 = unansweredQ2s[Math.floor(Math.random() * unansweredQ2s.length)] || questionsData[20];
    
    setActiveDialogueQ1(q1);
    setActiveDialogueQ2(q2);
    setCurrentDialogueNpc(adj);
    setDialogueStep(0);
  }, [gameState]);

  useEffect(() => {
    triggerNpcDialogueRef.current = triggerNpcDialogue;
  }, [triggerNpcDialogue]);

  // Answer a question and progress dialogue (with interval step to prevent double taps)
  const handleAnswerQuestion = (selectedType) => {
    if (!currentDialogueNpc || !activeDialogueQ1 || !activeDialogueQ2) return;
    const activeQ = dialogueStep === 0 ? activeDialogueQ1 : activeDialogueQ2;
    
    setAnswers(prev => ({ ...prev, [activeQ.id]: selectedType }));
    
    if (dialogueStep === 0) {
      setDialogueStep(0.5); // Go to "下一题" interval screen
    } else {
      // Resolve NPC
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
  };

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

  // Double tap / double click NPC interaction
  const handleNpcDoubleInteraction = (clickX, clickY) => {
    const npcIdx = NPC_POSITIONS.findIndex(npc => {
      const npcX = npc.c * TILE_SIZE + TILE_SIZE / 2;
      const npcY = npc.r * TILE_SIZE + TILE_SIZE / 2;
      return Math.hypot(clickX - npcX, clickY - npcY) < 30;
    });
    
    if (npcIdx !== -1) {
      const npc = NPC_POSITIONS[npcIdx];
      const px = playerPosRef.current.x;
      const py = playerPosRef.current.y;
      const npcX = npc.c * TILE_SIZE + TILE_SIZE / 2;
      const npcY = npc.r * TILE_SIZE + TILE_SIZE / 2;
      const dist = Math.hypot(px - npcX, py - npcY);
      
      if (dist < 55) {
        // Trigger dialogue directly
        const adj = { index: npcIdx, r: npc.r, c: npc.c, emoji: npc.emoji };
        if (!resolvedNpcsRef.current.has(npcIdx)) {
          const unansweredQ1s = questionsData.slice(0, 20).filter(q => !answersRef.current[q.id]);
          const q1 = unansweredQ1s[Math.floor(Math.random() * unansweredQ1s.length)] || questionsData[0];
          
          const unansweredQ2s = questionsData.slice(20, 40).filter(q => !answersRef.current[q.id]);
          const q2 = unansweredQ2s[Math.floor(Math.random() * unansweredQ2s.length)] || questionsData[20];
          
          setActiveDialogueQ1(q1);
          setActiveDialogueQ2(q2);
          setCurrentDialogueNpc(adj);
          setDialogueStep(0);
        }
      } else {
        // Steer player adjacent to this NPC
        const directions = [
          { r: npc.r - 1, c: npc.c },
          { r: npc.r + 1, c: npc.c },
          { r: npc.r, c: npc.c - 1 },
          { r: npc.r, c: npc.c + 1 }
        ];
        for (let d of directions) {
          if (d.r >= 0 && d.r < MAP_SIZE && d.c >= 0 && d.c < MAP_SIZE) {
            if (INITIAL_MAP[d.r][d.c] === 0) {
              targetPosRef.current = {
                x: d.c * TILE_SIZE + TILE_SIZE / 2,
                y: d.r * TILE_SIZE + TILE_SIZE / 2
              };
              break;
            }
          }
        }
      }
    }
  };

  // Click on map to move (touch-friendly mouse navigation, translated by camera offset)
  const handleCanvasClick = (e) => {
    if (gameState !== 'playing' || currentDialogueNpc !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left - cameraOffsetRef.current.x;
    const clickY = e.clientY - rect.top - cameraOffsetRef.current.y;
    
    // Check double click on desktop
    const now = Date.now();
    if (now - lastClickTimeRef.current < 300) {
      handleNpcDoubleInteraction(clickX, clickY);
    } else {
      targetPosRef.current = { x: clickX, y: clickY };
    }
    lastClickTimeRef.current = now;
  };

  // Touch handlers for mobile (One-finger tap to move, double-tap NPC, Two-finger drag to pan)
  const handleTouchStart = (e) => {
    if (gameState !== 'playing' || currentDialogueNpc !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    
    if (e.touches.length === 1) {
      // Single finger: tap movement or double tap NPC
      const t = e.touches[0];
      const clickX = t.clientX - rect.left - cameraOffsetRef.current.x;
      const clickY = t.clientY - rect.top - cameraOffsetRef.current.y;
      
      const now = Date.now();
      if (now - lastClickTimeRef.current < 300) {
        handleNpcDoubleInteraction(clickX, clickY);
      } else {
        targetPosRef.current = { x: clickX, y: clickY };
      }
      lastClickTimeRef.current = now;
      
      lastTouchPosRef.current = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2) {
      // Two fingers: start drag pan
      isDraggingRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      lastTouchPosRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
    }
  };

  const handleTouchMove = (e) => {
    if (gameState !== 'playing' || currentDialogueNpc !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    
    if (e.touches.length === 1 && !isDraggingRef.current) {
      // Continuous single touch drag to steer player
      const t = e.touches[0];
      const clickX = t.clientX - rect.left - cameraOffsetRef.current.x;
      const clickY = t.clientY - rect.top - cameraOffsetRef.current.y;
      targetPosRef.current = { x: clickX, y: clickY };
    } else if (e.touches.length === 2) {
      // Two finger drag to pan map
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      
      const dx = midX - lastTouchPosRef.current.x;
      const dy = midY - lastTouchPosRef.current.y;
      
      cameraOffsetRef.current.x += dx;
      cameraOffsetRef.current.y += dy;
      
      // Clamp camera offset based on current viewport size
      const displayWidth = rect.width;
      const displayHeight = rect.height;
      
      cameraOffsetRef.current.x = Math.max(Math.min(0, cameraOffsetRef.current.x), -(MAP_SIZE * TILE_SIZE - displayWidth));
      cameraOffsetRef.current.y = Math.max(Math.min(0, cameraOffsetRef.current.y), -(MAP_SIZE * TILE_SIZE - displayHeight));
      
      lastTouchPosRef.current = { x: midX, y: midY };
      e.preventDefault(); // Prevent standard page scroll
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      isDraggingRef.current = false;
    }
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
  
  useEffect(() => {
    currentDialogueNpcRef.current = currentDialogueNpc;
  }, [currentDialogueNpc]);

  useEffect(() => {
    mobileInteractTargetRef.current = mobileInteractTarget;
  }, [mobileInteractTarget]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

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
      // Check keyboard/mouse constant speed movement (zero drift, zero acceleration, instant stop)
      let ax = 0;
      let ay = 0;
      
      if (keysRef.current.up) ay -= 1;
      if (keysRef.current.down) ay += 1;
      if (keysRef.current.left) ax -= 1;
      if (keysRef.current.right) ax += 1;
      
      let keyboardMoving = (ax !== 0 || ay !== 0);
      
      let vx = 0;
      let vy = 0;
      const movementSpeed = 2.8; // Constant speed (pixels per frame) for tight controls with zero slide
      
      if (keyboardMoving) {
        targetPosRef.current = null; // Cancel any touch/mouse destination if keyboard is pressed
        const len = Math.hypot(ax, ay);
        vx = (ax / len) * movementSpeed;
        vy = (ay / len) * movementSpeed;
      } else if (targetPosRef.current) {
        const dx = targetPosRef.current.x - playerPosRef.current.x;
        const dy = targetPosRef.current.y - playerPosRef.current.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist <= movementSpeed) {
          playerPosRef.current.x = targetPosRef.current.x;
          playerPosRef.current.y = targetPosRef.current.y;
          targetPosRef.current = null;
          vx = 0;
          vy = 0;
        } else {
          vx = (dx / dist) * movementSpeed;
          vy = (dy / dist) * movementSpeed;
        }
      }
      
      vxRef.current = vx;
      vyRef.current = vy;
      
      // ----------------------------------------------------
      // 2. TILE COLLISION DETECTION & SLIDING RESOLUTION
      // ----------------------------------------------------
      const checkCollision = (x, y) => {
        const pr = 9;
        const left = x - pr;
        const right = x + pr;
        const top = y - pr;
        const bottom = y + pr;
        
        // Out of bounds check
        if (left < 0 || right > MAP_SIZE * TILE_SIZE || top < 0 || bottom > MAP_SIZE * TILE_SIZE) {
          return true; // Out of bounds is solid
        }
        return false; // Free roaming! No tree/gate collisions
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
      
      // CAMERA FOLLOW SYSTEM (relative to parent container viewport, with auto-centering on larger screens)
      const wrapper = canvas.parentElement;
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        const displayWidth = rect.width;
        const displayHeight = rect.height;
        const mapTotalWidth = MAP_SIZE * TILE_SIZE;
        const mapTotalHeight = MAP_SIZE * TILE_SIZE;
        
        if (displayWidth >= mapTotalWidth) {
          cameraOffsetRef.current.x = 0; // PC big screen: CSS flex centers the canvas, offset must be 0 to avoid clipping
        } else {
          const targetCamX = displayWidth / 2 - px;
          cameraOffsetRef.current.x = Math.max(Math.min(0, targetCamX), -(mapTotalWidth - displayWidth));
        }
        
        if (displayHeight >= mapTotalHeight) {
          cameraOffsetRef.current.y = 0; // PC big screen: CSS flex centers the canvas, offset must be 0 to avoid clipping
        } else {
          const targetCamY = displayHeight / 2 - py;
          cameraOffsetRef.current.y = Math.max(Math.min(0, targetCamY), -(mapTotalHeight - displayHeight));
        }
      }
      
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
          
          // Mobile confirm interaction popup trigger
          if (window.innerWidth < 768) {
            if (
              !resolvedNpcsRef.current.has(adj.index) && 
              currentDialogueNpcRef.current === null && 
              mobileInteractTargetRef.current === null &&
              dismissedNpcRef.current !== adj.index
            ) {
              setMobileInteractTarget(adj);
            }
          }
        } else {
          if (adjacentNpcStateRef.current !== null) {
            adjacentNpcStateRef.current = null;
            setAdjacentNpcState(null);
          }
          lastTriggeredNpcIdxRef.current = -1;
          dismissedNpcRef.current = -1; // Reset dismissed state when leaving NPC range
          if (mobileInteractTargetRef.current !== null) {
            setMobileInteractTarget(null);
          }
        }
      
      // ----------------------------------------------------
      // 3. CLEAR CANVAS & DRAW MAP
      // ----------------------------------------------------
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      ctx.translate(cameraOffsetRef.current.x, cameraOffsetRef.current.y);
      
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
      
      ctx.restore(); // Close cameraOffset translate save context
      
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

          {startStep === 0 && (
            <div className="start-page-content">
              <p className="start-desc">
                欢迎来到静心森林！<br /><br />
                你将扮演一位探索者，在静谧的森林中漫游。林中散布着<strong>心灵导引者</strong>。每遇见一位导引者，他将向你提出两个问题。遇到了足够的引导者之后，你将在心灵的探索之旅中发现匹配自己性格的圣经人物。
              </p>
              <button className="btn-primary" onClick={() => setStartStep(1)}>继续 (1 / 4)</button>
            </div>
          )}

          {startStep === 1 && (
            <div className="start-page-content">
              <div className="instruction-single-card">
                <div className="instruction-emoji">🚶</div>
                <h3>键盘或触摸漫游</h3>
                <p>使用 <strong>W/A/S/D</strong> 或 <strong>方向键</strong> 操控角色进行平顺的物理滑行移动，或直接点击地面目的地移动。</p>
              </div>
              <button className="btn-primary" onClick={() => setStartStep(2)}>继续 (2 / 4)</button>
            </div>
          )}

          {startStep === 2 && (
            <div className="start-page-content">
              <div className="instruction-single-card">
                <div className="instruction-emoji">🔮</div>
                <h3>探索答题</h3>
                <p>寻找林中的心灵引导者。靠近时按<strong>空格键(Space)</strong>，在手机端只需走近接触导引者，即可自动开启心灵对话。</p>
              </div>
              <button className="btn-primary" onClick={() => setStartStep(3)}>继续 (3 / 4)</button>
            </div>
          )}

          {startStep === 3 && (
            <div className="start-page-content">
              <div className="instruction-single-card">
                <div className="instruction-emoji">🚪</div>
                <h3>终点之门</h3>
                <p>找到足够多的心灵引导者后，森林底部的传送门将会开启，带你揭示匹配你性格的圣经人物画像。</p>
              </div>
              <button className="btn-primary" onClick={handleStartGame}>开启心灵探索 (4 / 4)</button>
            </div>
          )}
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
              <div className="stat-row visited-status-row">
                <span className="stat-label">已访问导引者：</span>
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
              
              <div className="stat-row portal-status-row" style={{ marginTop: '20px' }}>
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
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
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
          {currentDialogueNpc !== null && activeQuestion && dialogueStep !== 0.5 && (
            <div className="dialog-overlay">
              <div className="dialog-card">
                <button className="dialog-close-btn" onClick={() => { setCurrentDialogueNpc(null); setDialogueStep(0); setActiveDialogueQ1(null); setActiveDialogueQ2(null); }}>✕</button>
                <div className="dialog-progress">
                  导引者 {currentDialogueNpc.index + 1} / 20 • 抉择 {dialogueStep === 0 ? 1 : 2} / 2
                </div>
                <div className="dialog-npc-header">
                  <span className="dialog-npc-avatar">{currentDialogueNpc.emoji}</span>
                </div>
                <p className="dialog-question-text">
                  你是。。。？（选择最符合你的选项）
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
              </div>
            </div>
          )}

          {/* Interval Screen between Q1 and Q2 */}
          {currentDialogueNpc !== null && dialogueStep === 0.5 && (
            <div className="dialog-overlay">
              <div className="dialog-card interval-card">
                <div className="dialog-npc-header">
                  <span className="dialog-npc-avatar">{currentDialogueNpc.emoji}</span>
                </div>
                <p className="dialog-question-text" style={{ textAlign: 'center', margin: '20px 0', fontSize: '1.05rem' }}>
                  第一题探索完毕，准备好面对第二个抉择了吗？
                </p>
                <button 
                  className="btn-primary" 
                  style={{ width: '100%', padding: '12px', fontSize: '1.05rem' }} 
                  onClick={() => setDialogueStep(1)}
                >
                  下一题
                </button>
              </div>
            </div>
          )}
        </div>
      )}
          
          
          {/* Mobile Auto-Contact Confirm Modal */}
          {window.innerWidth < 768 && mobileInteractTarget && (
            <div className="dialog-overlay mobile-confirm-overlay">
              <div className="dialog-card mobile-confirm-card" style={{ maxWidth: '320px', width: '85%' }}>
                <div className="dialog-npc-header">
                  <span className="dialog-npc-avatar">{mobileInteractTarget.emoji}</span>
                </div>
                <p className="dialog-question-text" style={{ textAlign: 'center', margin: '20px 0', fontSize: '1.1rem', fontWeight: '500' }}>
                  是否与引导者对话？
                </p>
                <div className="confirm-buttons" style={{ display: 'flex', gap: '15px', width: '100%', boxSizing: 'border-box' }}>
                  <button 
                    className="btn-secondary" 
                    style={{ flex: 1, padding: '12px', fontSize: '1rem' }}
                    onClick={() => {
                      dismissedNpcRef.current = mobileInteractTarget.index;
                      setMobileInteractTarget(null);
                    }}
                  >
                    否
                  </button>
                  <button 
                    className="btn-primary" 
                    style={{ flex: 1, padding: '12px', fontSize: '1rem' }}
                    onClick={() => {
                      const adj = mobileInteractTarget;
                      const unansweredQ1s = questionsData.slice(0, 20).filter(q => !answersRef.current[q.id]);
                      const q1 = unansweredQ1s[Math.floor(Math.random() * unansweredQ1s.length)] || questionsData[0];
                      
                      const unansweredQ2s = questionsData.slice(20, 40).filter(q => !answersRef.current[q.id]);
                      const q2 = unansweredQ2s[Math.floor(Math.random() * unansweredQ2s.length)] || questionsData[20];
                      
                      setActiveDialogueQ1(q1);
                      setActiveDialogueQ2(q2);
                      setCurrentDialogueNpc(adj);
                      setDialogueStep(0);
                      setMobileInteractTarget(null);
                    }}
                  >
                    是
                  </button>
                </div>
              </div>
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
