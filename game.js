import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const stage = $('chess-stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#17201f');
const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
camera.position.set(7.5, 9.5, 11.8);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
stage.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, .1, 0);
controls.enableDamping = true;
controls.dampingFactor = .075;
controls.minDistance = 9;
controls.maxDistance = 19;
controls.maxPolarAngle = Math.PI * .46;
controls.minPolarAngle = .18;
controls.rotateSpeed = .55;
controls.enablePan = false;
scene.add(new THREE.HemisphereLight('#e7eee0', '#263431', 2.0));
const keyLight = new THREE.DirectionalLight('#fff0ce', 3.2);
keyLight.position.set(-5, 11, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -8; keyLight.shadow.camera.right = 8; keyLight.shadow.camera.top = 8; keyLight.shadow.camera.bottom = -8;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#a9c5bd', 1.15);
fillLight.position.set(7, 7, -6); scene.add(fillLight);
const boardGroup = new THREE.Group(); scene.add(boardGroup);
const pieceGroup = new THREE.Group(); scene.add(pieceGroup);
const markerGroup = new THREE.Group(); scene.add(markerGroup);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const squareMeshes = [];
let selected = null;
let legalTargets = [];
let flipped = false;
let lastMove = null;
let toastTimer;
let pendingPromotion = null;
let checkSquare = null;

function resize() {
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();

function mat(color, roughness = .42, metalness = .08) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const squareMats = [mat('#d9d4c3', .78, 0), mat('#60786f', .78, 0)];
const boardWood = mat('#293631', .35, .18);
const ivoryMat = mat('#efe5cf', .28, .12);
const darkMat = mat('#25302f', .27, .3);
const goldMat = new THREE.MeshStandardMaterial({ color: '#e5bc69', roughness: .23, metalness: .74, emissive: '#7c5421', emissiveIntensity: .12 });
const whiteAccent = mat('#c8b992', .3, .28);
const darkAccent = mat('#687973', .3, .36);
const boardGeometry = new THREE.BoxGeometry(1, .12, 1);
const markerGeometry = new THREE.PlaneGeometry(.92, .92);
const markerMaterial = new THREE.MeshBasicMaterial({ color: '#b5e08f', transparent: true, opacity: .31, depthWrite: false, side: THREE.DoubleSide });
const selectedMaterial = new THREE.MeshBasicMaterial({ color: '#e7ca78', transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide });
const lastMaterial = new THREE.MeshBasicMaterial({ color: '#e7bd60', transparent: true, opacity: .24, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
const checkMaterial = new THREE.MeshBasicMaterial({ color: '#df7159', transparent: true, opacity: .4, depthWrite: false, side: THREE.DoubleSide });
const dotGeometry = new THREE.CircleGeometry(.15, 24);
const dotMaterial = new THREE.MeshBasicMaterial({ color: '#f0f3db', transparent: true, opacity: .8 });
const captureRingGeometry = new THREE.RingGeometry(.34, .43, 36);
const captureRingMaterial = new THREE.MeshBasicMaterial({ color: '#f2d18a', transparent: true, opacity: .9, side: THREE.DoubleSide });

function posOf(file, rank) { return [file - 3.5, .2, 3.5 - rank]; }
function makeBoard() {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.36, .34, 8.36), boardWood);
  frame.position.set(0, -.055, 0); frame.receiveShadow = true; frame.castShadow = true; boardGroup.add(frame);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(8.46, .10, 8.46), mat('#493c29', .3, .38));
  trim.position.y = -.225; boardGroup.add(trim);
  for (let rank = 0; rank < 8; rank++) for (let file = 0; file < 8; file++) {
    const mesh = new THREE.Mesh(boardGeometry, squareMats[(file + rank) % 2]);
    mesh.position.set(file - 3.5, .13, 3.5 - rank); mesh.receiveShadow = true;
    mesh.userData.square = { file, rank }; boardGroup.add(mesh); squareMeshes.push(mesh);
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(200, 64), new THREE.MeshBasicMaterial({ color: '#17201f' }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.27; scene.add(floor);
}
makeBoard();

function mesh(geometry, material, group, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
}
function cylinder(rt, rb, h, material, group, x, y, z, segments = 32) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material, group, x, y, z);
}
function sphere(r, material, group, x, y, z, sx = 1, sy = 1, sz = 1) {
  return mesh(new THREE.SphereGeometry(r, 24, 16), material, group, x, y, z, sx, sy, sz);
}
function buildPiece(piece, file, rank) {
  const root = new THREE.Group(); root.position.set(file - 3.5, .19, 3.5 - rank);
  root.userData.square = { file, rank }; root.userData.piece = piece;
  const royal = piece.royal;
  const baseMat = royal ? goldMat : piece.color === 'w' ? ivoryMat : darkMat;
  const accent = royal ? goldMat : piece.color === 'w' ? whiteAccent : darkAccent;
  const scale = piece.type === 'king' || royal ? 1 : .9;
  const g = new THREE.Group(); g.scale.setScalar(scale); root.add(g);
  cylinder(.36, .39, .13, baseMat, g, 0, .065, 0);
  cylinder(.28, .35, .10, accent, g, 0, .17, 0);
  cylinder(.22, .26, .12, baseMat, g, 0, .27, 0);
  const collarY = .35;
  if (piece.type === 'pawn' && !royal) {
    cylinder(.19, .23, .28, baseMat, g, 0, .48, 0);
    sphere(.2, accent, g, 0, .72, 0, 1, 1.05, 1);
    sphere(.105, piece.color === 'w' ? ivoryMat : darkMat, g, 0, .74, .145, .72, .82, .72);
  } else if (piece.type === 'rook' && !royal) {
    cylinder(.22, .17, .45, baseMat, g, 0, .58, 0);
    cylinder(.27, .21, .11, accent, g, 0, .84, 0);
    cylinder(.22, .24, .12, baseMat, g, 0, .95, 0);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; mesh(new THREE.BoxGeometry(.12, .14, .12), accent, g, Math.cos(a) * .17, 1.06, Math.sin(a) * .17); }
  } else if (piece.type === 'knight' && !royal) {
    cylinder(.19, .16, .40, baseMat, g, 0, .55, 0);
    sphere(.22, accent, g, 0, .78, -.015, .8, 1.15, .76);
    // Sculpted horse head, muzzle, ears and mane.
    sphere(.145, baseMat, g, .025, .96, .02, .78, 1.25, .75);
    sphere(.11, baseMat, g, .045, 1.04, -.11, .8, .8, 1.3);
    sphere(.09, accent, g, .06, .94, .12, .85, 1.1, .75);
    mesh(new THREE.ConeGeometry(.072, .22, 4), baseMat, g, -.055, 1.18, -.015, 1, 1, 1);
    sphere(.028, royal ? goldMat : piece.color === 'w' ? darkMat : ivoryMat, g, .11, 1.02, .06);
  } else if (piece.type === 'bishop' && !royal) {
    cylinder(.19, .16, .42, baseMat, g, 0, .56, 0);
    sphere(.18, accent, g, 0, .84, 0, .82, 1.15, .82);
    sphere(.09, baseMat, g, 0, 1.01, 0);
    mesh(new THREE.ConeGeometry(.035, .26, 12), accent, g, 0, 1.20, 0);
    const slash = mesh(new THREE.BoxGeometry(.045, .18, .045), piece.color === 'w' ? darkAccent : ivoryMat, g, .06, .86, .08); slash.rotation.z = -.48;
  } else if (piece.type === 'queen' && !royal) {
    cylinder(.19, .16, .42, baseMat, g, 0, .56, 0);
    sphere(.20, accent, g, 0, .83, 0, 1.1, .66, 1.1);
    cylinder(.19, .22, .10, baseMat, g, 0, .98, 0);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; sphere(.065, accent, g, Math.cos(a) * .17, 1.12 + (i % 2) * .07, Math.sin(a) * .17); }
    sphere(.08, accent, g, 0, 1.22, 0);
  } else {
    // The crowned king stays royal gold, even after inheriting a movement power.
    cylinder(.20, .16, .45, baseMat, g, 0, .57, 0);
    sphere(.20, accent, g, 0, .87, 0, 1.15, .62, 1.15);
    cylinder(.20, .23, .1, baseMat, g, 0, 1.0, 0);
    cylinder(.13, .16, .16, accent, g, 0, 1.10, 0);
    cylinder(.035, .035, .25, goldMat, g, 0, 1.31, 0, 12);
    cylinder(.14, .14, .035, goldMat, g, 0, 1.31, 0, 12);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.42, 24), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: .18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .008; root.add(shadow);
  pieceGroup.add(root); return root;
}
function renderPieces() {
  pieceGroup.clear();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if (state.board[r][f]) buildPiece(state.board[r][f], f, r);
}
function marker(file, rank, material, y = .205) {
  const m = new THREE.Mesh(markerGeometry, material); m.rotation.x = -Math.PI / 2; m.position.set(file - 3.5, y, 3.5 - rank); markerGroup.add(m); return m;
}
function renderMarkers() {
  markerGroup.clear();
  if (lastMove) { marker(lastMove.from.file, lastMove.from.rank, lastMaterial, .207); marker(lastMove.to.file, lastMove.to.rank, lastMaterial, .207); }
  if (checkSquare) marker(checkSquare.file, checkSquare.rank, checkMaterial, .209);
  if (selected) {
    marker(selected.file, selected.rank, selectedMaterial, .211);
    for (const move of legalTargets) {
      marker(move.file, move.rank, selectedMaterial, .208);
      if (state.board[move.rank][move.file] || move.enPassant) {
        const ring = new THREE.Mesh(captureRingGeometry, captureRingMaterial); ring.rotation.x = -Math.PI / 2; ring.position.set(move.file - 3.5, .218, 3.5 - move.rank); markerGroup.add(ring);
      } else {
        const dot = new THREE.Mesh(dotGeometry, dotMaterial); dot.rotation.x = -Math.PI / 2; dot.position.set(move.file - 3.5, .219, 3.5 - move.rank); markerGroup.add(dot);
      }
    }
  }
}
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();

const files = 'abcdefgh';
const pieceNames = { king: 'King', queen: 'Queen', rook: 'Rook', bishop: 'Bishop', knight: 'Knight', pawn: 'Pawn' };
const symbols = { w: { king:'♔', queen:'♕', rook:'♖', bishop:'♗', knight:'♘', pawn:'♙' }, b: { king:'♚', queen:'♛', rook:'♜', bishop:'♝', knight:'♞', pawn:'♟' } };
let state;
function makeInitialBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ['rook','knight','bishop','queen','king','bishop','knight','rook'];
  for (let f = 0; f < 8; f++) {
    board[0][f] = { color:'b', type:back[f], royal:back[f] === 'king', moved:false, canCastle:back[f] === 'king', castleRook:back[f] === 'rook' };
    board[1][f] = { color:'b', type:'pawn', royal:false, moved:false };
    board[6][f] = { color:'w', type:'pawn', royal:false, moved:false };
    board[7][f] = { color:'w', type:back[f], royal:back[f] === 'king', moved:false, canCastle:back[f] === 'king', castleRook:back[f] === 'rook' };
  }
  return board;
}
function cloneBoard(board) { return board.map(row => row.map(p => p ? { ...p } : null)); }
function inBounds(f,r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }
function sameSquare(a,b) { return a.file === b.file && a.rank === b.rank; }
function addTarget(out, board, f, r, color, extra = {}) {
  if (!inBounds(f,r)) return false;
  const target = board[r][f];
  if (target?.color === color || target?.royal) return false;
  out.push({ file:f, rank:r, ...extra });
  return !target;
}
function pseudoMoves(board, file, rank, ep = null) {
  const piece = board[rank]?.[file]; if (!piece) return [];
  const out = [], color = piece.color;
  const addSlides = (dirs) => {
    for (const [df,dr] of dirs) for (let n=1; n<8; n++) if (!addTarget(out,board,file+df*n,rank+dr*n,color)) break;
  };
  const addSteps = (dirs) => { for (const [df,dr] of dirs) addTarget(out,board,file+df,rank+dr,color); };
  const movesForPower = (power) => {
    if (power === 'rook') addSlides([[1,0],[-1,0],[0,1],[0,-1]]);
    if (power === 'bishop') addSlides([[1,1],[1,-1],[-1,1],[-1,-1]]);
    if (power === 'queen') addSlides([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
    if (power === 'knight') addSteps([[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]);
    if (power === 'king') addSteps([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
    if (power === 'pawn') {
      const dir = color === 'w' ? -1 : 1;
      for (const df of [-1,1]) {
        const f=file+df, r=rank+dir;
        if (inBounds(f,r) && (board[r][f]?.color && board[r][f].color !== color && !board[r][f].royal || ep && ep.file===f && ep.rank===r)) out.push({file:f,rank:r,...(ep&&ep.file===f&&ep.rank===r?{enPassant:true}:{})});
      }
      const r=rank+dir;
      if (inBounds(file,r) && !board[r][file]) {
        out.push({file,rank:r});
        const r2=rank+dir*2;
        if (!piece.moved && inBounds(file,r2) && !board[r2][file]) out.push({file,rank:r2,doublePawn:true});
      }
    }
  };
  if (piece.royal) movesForPower('king');
  if (piece.type !== 'king') movesForPower(piece.type);
  if (piece.royal && piece.canCastle && !piece.moved && piece.type === 'king') {
    const home = color === 'w' ? 7 : 0;
    if (rank === home && file === 4 && !isInCheck(board,color)) {
      for (const side of [-1,1]) {
        const rookFile = side < 0 ? 0 : 7, rook=board[home][rookFile];
        const between = side < 0 ? [1,2,3] : [5,6];
        if (!rook || rook.color!==color || !rook.castleRook || rook.moved || between.some(f=>board[home][f])) continue;
        const transit = side < 0 ? [3,2] : [5,6];
        if (transit.some(f=>isSquareAttacked(board,f,home,color==='w'?'b':'w'))) continue;
        out.push({file:side<0?2:6,rank:home,castle:true,rookFrom:rookFile,rookTo:side<0?3:5});
      }
    }
  }
  return out;
}
function attacksFrom(board, file, rank) {
  const p=board[rank][file], result=new Set(); if(!p) return result;
  const add=(f,r)=>{if(inBounds(f,r))result.add(`${f},${r}`);};
  const slide=(dirs)=>{for(const[df,dr]of dirs)for(let n=1;n<8;n++){const f=file+df*n,r=rank+dr*n;if(!inBounds(f,r))break;add(f,r);if(board[r][f])break;}};
  const steps=(dirs)=>dirs.forEach(([df,dr])=>add(file+df,rank+dr));
  const power=(type)=>{
    if(type==='rook')slide([[1,0],[-1,0],[0,1],[0,-1]]);
    if(type==='bishop')slide([[1,1],[1,-1],[-1,1],[-1,-1]]);
    if(type==='queen')slide([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
    if(type==='knight')steps([[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]);
    if(type==='king')steps([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
    if(type==='pawn'){const d=p.color==='w'?-1:1;add(file-1,rank+d);add(file+1,rank+d);}
  };
  if(p.royal)power('king'); power(p.type); return result;
}
function isSquareAttacked(board,file,rank,byColor) {
  const key=`${file},${rank}`;
  for(let r=0;r<8;r++)for(let f=0;f<8;f++)if(board[r][f]?.color===byColor&&attacksFrom(board,f,r).has(key))return true;
  return false;
}
function isInCheck(board,color) {
  let king=null;
  for(let r=0;r<8;r++)for(let f=0;f<8;f++)if(board[r][f]?.color===color&&board[r][f].royal)king={file:f,rank:r};
  return king ? isSquareAttacked(board,king.file,king.rank,color==='w'?'b':'w') : false;
}
function applyToBoard(board, move, promotion = null) {
  const piece=board[move.from.rank][move.from.file];
  let captured=null, capturedAt={file:move.to.file,rank:move.to.rank};
  if(move.enPassant){capturedAt={file:move.to.file,rank:move.from.rank};captured=board[capturedAt.rank][capturedAt.file];board[capturedAt.rank][capturedAt.file]=null;}
  else captured=board[move.to.rank][move.to.file];
  board[move.from.rank][move.from.file]=null;
  if(captured) piece.type=captured.type;
  piece.moved=true;
  if(move.castle){const rook=board[move.from.rank][move.rookFrom];board[move.from.rank][move.rookFrom]=null;board[move.from.rank][move.rookTo]=rook;rook.moved=true;}
  board[move.to.rank][move.to.file]=piece;
  if(promotion)piece.type=promotion;
  return {captured,capturedAt,piece};
}
function legalMoves(board,file,rank,ep=state?.ep) {
  const p=board[rank]?.[file];if(!p)return[];
  const color=p.color;
  return pseudoMoves(board,file,rank,ep).filter(move=>{
    const copy=cloneBoard(board);applyToBoard(copy,{from:{file,rank},...move,to:{file:move.file,rank:move.rank}},null);
    return !isInCheck(copy,color);
  });
}
function allLegalMoves(color) {
  const moves=[];
  for(let r=0;r<8;r++)for(let f=0;f<8;f++)if(state.board[r][f]?.color===color)for(const m of legalMoves(state.board,f,r,state.ep))moves.push({from:{file:f,rank:r},...m});
  return moves;
}
function newState() { return {board:makeInitialBoard(),turn:'w',ep:null,captured:{w:[],b:[]},history:[],log:[],gameOver:false}; }
state=newState();
function colorName(color){return color==='w'?'IVORY':'ONYX';}
function squareName(file,rank){return `${files[file]}${8-rank}`;}
function currentRoyal(color){for(let r=0;r<8;r++)for(let f=0;f<8;f++)if(state.board[r][f]?.color===color&&state.board[r][f].royal)return{file:f,rank:r};return null;}
function showToast(message) {
  const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2300);
}
function setSelection(square) {
  selected=square;legalTargets=square?legalMoves(state.board,square.file,square.rank):[];
  if(square){const p=state.board[square.rank][square.file];$('status-title').textContent=`${p.royal?'Golden king':pieceNames[p.type]} selected`;$('status-copy').textContent=legalTargets.length?`${legalTargets.length} legal ${legalTargets.length===1?'move':'moves'} highlighted.`:'No legal moves from here.';}
  else updateStatus();
  renderMarkers();
}
function notation(piece,move,captured,powerBefore) {
  const name={king:'K',queen:'Q',rook:'R',bishop:'B',knight:'N',pawn:''}[powerBefore];
  const start=piece.type==='pawn'&&!captured?'':name;
  const to=squareName(move.to.file,move.to.rank);
  return `${start}${captured?'x':''}${to}${move.castle?(move.to.file===6?' O-O':' O-O-O'):''}`;
}
function saveSnapshot(){state.history.push({board:cloneBoard(state.board),turn:state.turn,ep:state.ep?{...state.ep}:null,captured:{w:[...state.captured.w],b:[...state.captured.b]},log:state.log.map(x=>({...x})),gameOver:state.gameOver});}
function playMove(move,promotion=null) {
  const from=move.from,to=move.to;
  const piece=state.board[from.rank][from.file], powerBefore=piece.type;
  const target=move.enPassant?state.board[from.rank][to.file]:state.board[to.rank][to.file];
  if(to.rank===0||to.rank===7){if(powerBefore==='pawn'&&!promotion){pendingPromotion=move;openPromotion(piece.color);return;}}
  saveSnapshot();
  const result=applyToBoard(state.board,move,promotion);
  if(result.captured)state.captured[piece.color].push({color:result.captured.color,type:result.captured.type});
  state.ep=null;
  if(powerBefore==='pawn'&&Math.abs(to.rank-from.rank)===2)state.ep={file:to.file,rank:(to.rank+from.rank)/2};
  const san=notation(piece,move,result.captured,powerBefore);
  state.turn=piece.color==='w'?'b':'w';state.gameOver=false;
  const check=isInCheck(state.board,state.turn), replies=allLegalMoves(state.turn);
  if(check)state.log.push({color:piece.color,san:san+(replies.length?' +':' #'),detail:result.captured?`↔ ${pieceNames[result.captured.type]}`:''});
  else state.log.push({color:piece.color,san,detail:result.captured?`↔ ${pieceNames[result.captured.type]}`:''});
  if(replies.length===0)state.gameOver=true;
  lastMove={from:{...from},to:{...to}};selected=null;legalTargets=[];pendingPromotion=null;
  checkSquare=check?currentRoyal(state.turn):null;
  renderPieces();renderMarkers();updateUI();
  if(result.captured)showToast(`${pieceNames[result.captured.type]} captured · ${piece.royal?'Your golden king gained':'Power acquired'} ${pieceNames[result.captured.type]} power`);
  else if(move.castle)showToast('Castling — the crown is guarded.');
  else if(promotion)showToast(`Pawn promoted to ${pieceNames[promotion]}.`);
}
function updateStatus() {
  const card=$('status-card'), title=$('status-title'), copy=$('status-copy'), icon=$('status-icon');
  card.classList.remove('check');
  const check=isInCheck(state.board,state.turn), options=allLegalMoves(state.turn);
  checkSquare=check?currentRoyal(state.turn):null;
  if(state.gameOver){
    const winner=state.turn==='w'?'ONYX':'IVORY';title.textContent=options.length===0&&check?'Checkmate — '+winner+' wins':'Draw by stalemate';copy.textContent='The crown has found its final square.';icon.textContent='♛';
  } else if(check){card.classList.add('check');title.textContent=`${colorName(state.turn)} is in check`;copy.textContent='Move the golden king out of danger.';icon.textContent='!';}
  else {title.textContent=selected?'Choose a highlighted square':'The board is yours';copy.textContent=selected?'Tap a glowing square to make your move.':'Select a piece to see its moves.';icon.textContent='✦';}
}
function updateUI() {
  const whiteTurn=state.turn==='w';
  $('turn-label').textContent=state.gameOver?'GAME OVER':`${colorName(state.turn)} TO MOVE`;
  $('turn-dot').style.background=whiteTurn?'#c5d0bd':'#73827a';
  $('black-chip').style.opacity=whiteTurn?'.66':'1';$('white-chip').style.opacity=whiteTurn?'1':'.66';
  $('move-count').textContent=`MOVE ${String(Math.floor(state.log.length/2)+1).padStart(2,'0')}`;
  $('log-count').textContent=`${state.log.length} PLY`;
  $('undo-move').disabled=state.history.length===0;
  const whiteTaken=state.captured.w.map(p=>symbols[p.color][p.type]).join(' ');
  const blackTaken=state.captured.b.map(p=>symbols[p.color][p.type]).join(' ');
  $('white-captured').textContent=whiteTaken;$('black-captured').textContent=blackTaken;
  const log=$('move-log');
  if(!state.log.length)log.innerHTML='<div class="empty-log">Your opening move starts here.</div>';
  else {
    const rows=[];
    for(let i=0;i<state.log.length;i+=2){const white=state.log[i],black=state.log[i+1];rows.push(`<div class="move-entry"><span class="move-number">${String(Math.floor(i/2)+1).padStart(2,'0')}</span><span class="move-san ${i===state.log.length-1?'recent':''}">${white?.san||''}<small class="move-detail">${white?.detail||''}</small></span><span class="move-san ${i+1===state.log.length-1?'recent':''}">${black?.san||''}<small class="move-detail">${black?.detail||''}</small></span></div>`);}
    log.innerHTML=rows.join('');log.scrollTop=log.scrollHeight;
  }
  updateStatus();
}
function restart() {
  state=newState();selected=null;legalTargets=[];lastMove=null;checkSquare=null;pendingPromotion=null;
  renderPieces();renderMarkers();updateUI();showToast('A fresh board. Make your opening move.');
}
function undo() {
  if(!state.history.length)return;
  const snap=state.history.pop();state.board=snap.board;state.turn=snap.turn;state.ep=snap.ep;state.captured=snap.captured;state.log=snap.log;state.gameOver=snap.gameOver;
  selected=null;legalTargets=[];pendingPromotion=null;const last=state.log.at(-1);lastMove=null;checkSquare=isInCheck(state.board,state.turn)?currentRoyal(state.turn):null;
  if(last){const prev=state.history.at(-1);if(prev){/* move highlight is intentionally cleared on rewind */}}
  renderPieces();renderMarkers();updateUI();showToast('Last move taken back.');
}
function openPromotion(color) {
  const options=['queen','rook','bishop','knight'];
  $('promotion-options').innerHTML=options.map(type=>`<button class="promotion-option" data-power="${type}"><span>${symbols[color][type]}</span><small>${pieceNames[type].toUpperCase()}</small></button>`).join('');
  $('promotion-dialog').hidden=false;
}
$('promotion-options').addEventListener('click',e=>{
  const button=e.target.closest('[data-power]');if(!button||!pendingPromotion)return;
  const move=pendingPromotion;move.to={file:move.file,rank:move.rank};$('promotion-dialog').hidden=true;playMove(move,button.dataset.power);
});
$('close-promotion').addEventListener('click',()=>{$('promotion-dialog').hidden=true;pendingPromotion=null;});
function doFlip() {
  flipped=!flipped;const p=flipped?new THREE.Vector3(-7.5,9.5,-11.8):new THREE.Vector3(7.5,9.5,11.8);
  camera.position.copy(p);controls.target.set(0,.1,0);controls.update();
  const f=document.querySelector('.coords-files').children,r=document.querySelector('.coords-ranks').children;
  [...f].forEach((el,i)=>el.textContent=files[flipped?7-i:i]);
  [...r].forEach((el,i)=>el.textContent=String(flipped?i+1:8-i));
}
$('new-game').addEventListener('click',restart);$('undo-move').addEventListener('click',undo);$('flip-board').addEventListener('click',doFlip);
$('rules-button').addEventListener('click',()=>$('rules-dialog').hidden=false);
$('close-rules').addEventListener('click',()=>$('rules-dialog').hidden=true);
$('rules-done').addEventListener('click',()=>$('rules-dialog').hidden=true);
$('rules-dialog').addEventListener('click',e=>{if(e.target===$('rules-dialog'))$('rules-dialog').hidden=true;});
let downPoint=null;
renderer.domElement.addEventListener('pointerdown',e=>{downPoint={x:e.clientX,y:e.clientY};},{passive:true});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!downPoint)return;const distance=Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y);downPoint=null;
  if(distance>9||state.gameOver||pendingPromotion)return;
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((e.clientX-rect.left)/rect.width)*2-1;pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects([pieceGroup,boardGroup],true);
  if(!hits.length)return;
  let node=hits[0].object;
  while(node&&!node.userData.square)node=node.parent;
  if(!node)return;
  const square=node.userData.square, onPiece=node.userData.piece;
  if(selected){
    const move=legalTargets.find(m=>m.file===square.file&&m.rank===square.rank);
    if(move){playMove({from:{...selected},to:{file:move.file,rank:move.rank},...move});return;}
  }
  if(onPiece&&onPiece.color===state.turn){
    if(selected&&sameSquare(selected,square)){setSelection(null);return;}
    setSelection(square);return;
  }
  setSelection(null);
},{passive:true});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(!$('rules-dialog').hidden)$('rules-dialog').hidden=true;
    if(!$('promotion-dialog').hidden){$('promotion-dialog').hidden=true;pendingPromotion=null;}
    else if(selected)setSelection(null);
  }
});
renderPieces();renderMarkers();updateUI();
