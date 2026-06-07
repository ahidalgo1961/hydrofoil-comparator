import { PoseLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

const getE = id => document.getElementById(id);
const userVideo = getE('userVideo'); const userCanvas = getE('userCanvas'); const userCtx = userCanvas.getContext('2d');
const proVideo = getE('proVideo'); const proCanvas = getE('proCanvas'); const proCtx = proCanvas.getContext('2d');
const playPauseBtn = getE('playPauseBtn'); const diagnosticReport = getE('diagnosticReport');

let poseLandmarker = null;
let isAnalyzing = false;
let animationId = null;

const state = { 
    user: { start: 0, end: 5, endSet: false }, 
    pro: { start: 0, end: 5, endSet: false } 
};

let analysisData = { 
    user: { times: [], knee: [], back: [], cgHeight: [], ankle: [], arm: [], head: [], pitch: [] }, 
    pro: { times: [], knee: [], back: [], cgHeight: [], ankle: [], arm: [], head: [], pitch: [] } 
};

async function initializeMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
            delegate: 'GPU'
        },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    diagnosticReport.innerHTML = '<p class="good">✅ IA Cargada. Usa la línea de tiempo para enmarcar el bombeo.</p>';
}

function handleVideoLoad(type, videoEl) {
    videoEl.onloadedmetadata = () => {
        getE(`${type}Scrubber`).max = videoEl.duration;
        if (!state[type].endSet) {
            state[type].end = videoEl.duration;
        } else if (state[type].end > videoEl.duration) {
            state[type].end = videoEl.duration;
        }
        updateTimeSpan(type);
    };
    
    // Esperamos a que el video tenga datos para hacer el seek, evitando que el navegador se congele
    videoEl.onloadeddata = () => {
        videoEl.currentTime = state[type].start;
    };
    
    videoEl.ontimeupdate = () => {
        if (!isAnalyzing && !isLooping) {
            getE(`${type}Scrubber`).value = videoEl.currentTime;
            
            // Lógica de bucle para modo "Solo Franja"
            const playMode = getE(`${type}PlayMode`).value;
            if (playMode === 'range' && videoEl.currentTime >= state[type].end && !videoEl.paused) {
                videoEl.currentTime = state[type].start;
            }
        }
    };
}
handleVideoLoad('user', userVideo); handleVideoLoad('pro', proVideo);

function updateScrubberHighlight(type) {
    const v = type === 'user' ? userVideo : proVideo;
    if (!v.duration) return;

    const startMarker = getE(`${type}StartMarker`);
    const endMarker = getE(`${type}EndMarker`);
    const highlight = getE(`${type}ScrubberHighlight`);

    if (state[type].startSet) {
        const startPct = (state[type].start / v.duration) * 100;
        if(startMarker) {
            startMarker.style.display = 'block';
            startMarker.style.left = `${startPct}%`;
        }
    }
    if (state[type].endSet) {
        const endPct = (state[type].end / v.duration) * 100;
        if(endMarker) {
            endMarker.style.display = 'block';
            endMarker.style.left = `${endPct}%`;
        }
    }
    if (state[type].startSet && state[type].endSet) {
        const startPct = (state[type].start / v.duration) * 100;
        const endPct = (state[type].end / v.duration) * 100;
        if (highlight) {
            highlight.style.display = 'block';
            highlight.style.left = `${startPct}%`;
            highlight.style.width = `${endPct - startPct}%`;
        }
    } else if (highlight) {
        highlight.style.display = 'none';
    }
}

const updateTimeSpan = (t) => {
    getE(`${t}TimeSpan`).innerText = `${state[t].start.toFixed(2)}s - ${state[t].end.toFixed(2)}s`;
    updateScrubberHighlight(t);
};

function saveConfig() {
    const cfg = {
        user: { start: state.user.start, startSet: state.user.startSet, end: state.user.end, endSet: state.user.endSet, zoom: getE('userZoom').value, panX: getE('userPanX').value, panY: getE('userPanY').value },
        pro: { start: state.pro.start, startSet: state.pro.startSet, end: state.pro.end, endSet: state.pro.endSet, zoom: getE('proZoom').value, panX: getE('proPanX').value, panY: getE('proPanY').value }
    };
    localStorage.setItem('hydrofoil_config', JSON.stringify(cfg));
}

['user', 'pro'].forEach(type => {
    const uploadBtn = getE(`${type}VideoUpload`);
    uploadBtn.addEventListener('click', function() { this.value = null; }); // Forzar evento change aunque sea el mismo archivo
    uploadBtn.addEventListener('change', e => { 
        if(e.target.files && e.target.files[0]) {
            const video = type === 'user' ? userVideo : proVideo;
            video.src = URL.createObjectURL(e.target.files[0]);
            video.load();
        }
    });
    
    getE(`${type}Scrubber`).addEventListener('input', e => {
        const video = type === 'user' ? userVideo : proVideo;
        video.currentTime = e.target.value;
    });
    getE(`${type}SetStartBtn`).addEventListener('click', () => {
        state[type].start = type === 'user' ? userVideo.currentTime : proVideo.currentTime;
        state[type].startSet = true;
        updateTimeSpan(type);
        updateScrubberHighlight(type);
        saveConfig();
    });
    getE(`${type}SetEndBtn`).addEventListener('click', () => {
        state[type].end = type === 'user' ? userVideo.currentTime : proVideo.currentTime;
        state[type].endSet = true;
        updateTimeSpan(type);
        updateScrubberHighlight(type);
        saveConfig();
    });

    const fsBtn = getE(`${type}FullscreenBtn`);
    if (fsBtn) {
        fsBtn.addEventListener('click', () => {
            const panel = fsBtn.closest('.video-panel');
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (panel.requestFullscreen) {
                    panel.requestFullscreen();
                } else if (panel.webkitRequestFullscreen) {
                    panel.webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        });
    }
});

// Controles de Reproducción y Loop
let isLooping = false;
let loopAnimId = null;

function renderLoopSync() {
    if(!isLooping) return;
    if (userVideo.currentTime >= state.user.end) userVideo.currentTime = state.user.start;
    if (proVideo.currentTime >= state.pro.end) proVideo.currentTime = state.pro.start;
    loopAnimId = requestAnimationFrame(renderLoopSync);
}

getE('playLoopBtn').addEventListener('click', () => {
    if (isAnalyzing) return;
    isLooping = !isLooping;
    if (isLooping) {
        userVideo.currentTime = state.user.start; proVideo.currentTime = state.pro.start;
        
        // Ajuste automático de velocidad para una sincronización visual perfecta
        const uDur = state.user.end - state.user.start;
        const pDur = state.pro.end - state.pro.start;
        if (uDur > 0 && pDur > 0) {
            userVideo.playbackRate = uDur / pDur;
        }
        
        userVideo.play(); proVideo.play();
        getE('playLoopBtn').innerText = '⏹ Detener Comparación';
        getE('playLoopBtn').style.backgroundColor = 'var(--danger)';
        renderLoopSync();
    } else {
        userVideo.pause(); proVideo.pause();
        userVideo.playbackRate = 1.0; proVideo.playbackRate = 1.0;
        getE('playLoopBtn').innerText = '🔄 Comparación Sincronizada';
        getE('playLoopBtn').style.backgroundColor = 'var(--accent-hover)';
        cancelAnimationFrame(loopAnimId);
    }
});

['user', 'pro'].forEach(p => { 
    const v = p === 'user' ? userVideo : proVideo;
    
    getE(`${p}PlayBtn`).addEventListener('click', () => {
        if (v.paused) v.play(); else v.pause();
    });
    
    getE(`${p}PrevFrameBtn`).addEventListener('click', () => {
        v.pause();
        v.currentTime = Math.max(0, v.currentTime - 0.0333);
    });
    
    getE(`${p}NextFrameBtn`).addEventListener('click', () => {
        v.pause();
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 0.0333);
    });
    
    ['Zoom', 'PanX', 'PanY'].forEach(c => { 
        getE(`${p}${c}`).addEventListener('input', () => {
            updateTransform(p);
            saveConfig();
        }); 
    }); 
});

// Estado virtual de cámara para Auto-Framing (EMA Gimbal)
let cameraState = {
    user: { z: 1, x: 0, y: 0 },
    pro: { z: 1, x: 0, y: 0 }
};

function updateTransform(type) {
    const wrapper = getE(`${type}Transform`);
    const autoFrameCb = getE(`${type}AutoFrame`);
    const z = parseFloat(getE(`${type}Zoom`).value);
    const px = parseFloat(getE(`${type}PanX`).value);
    const py = parseFloat(getE(`${type}PanY`).value);
    
    if (autoFrameCb && autoFrameCb.checked) {
        // El AI tracking base se combina dinámicamente con los sliders manuales
        const finalZ = cameraState[type].z * z;
        const finalPx = cameraState[type].x + px;
        const finalPy = cameraState[type].y + py;
        wrapper.style.transform = `scale(${finalZ}) translate(${finalPx}%, ${finalPy}%)`;
    } else {
        wrapper.style.transform = `scale(${z}) translate(${px}%, ${py}%)`;
    }
}

['user', 'pro'].forEach(type => {
    const autoFrameCb = getE(`${type}AutoFrame`);
    if (autoFrameCb) {
        autoFrameCb.addEventListener('change', () => {
            // Ya no deshabilitamos los sliders, ahora sirven para tunear el Auto-Frame
            updateTransform(type);
        });
    }
});

// Cargar configuración de LocalStorage si existe
try {
    const cfg = JSON.parse(localStorage.getItem('hydrofoil_config'));
    if (cfg) {
        ['user', 'pro'].forEach(p => {
            if (cfg[p].start !== undefined) {
                state[p].start = cfg[p].start;
                // Auto-fix retrocompatible para configuraciones previas al parche
                if (cfg[p].startSet === undefined && cfg[p].endSet === true) {
                    state[p].startSet = true;
                } else if (cfg[p].startSet !== undefined) {
                    state[p].startSet = cfg[p].startSet;
                }
            }
            if (cfg[p].end !== undefined) state[p].end = cfg[p].end;
            if (cfg[p].endSet !== undefined) state[p].endSet = cfg[p].endSet;
            if (cfg[p].zoom) getE(`${p}Zoom`).value = cfg[p].zoom;
            if (cfg[p].panX) getE(`${p}PanX`).value = cfg[p].panX;
            if (cfg[p].panY) getE(`${p}PanY`).value = cfg[p].panY;
            updateTransform(p);
            updateTimeSpan(p);
        });
    }
} catch (e) {}

// Matemáticas Vectoriales 3D
function calcAngle3D(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y + v1.z*v1.z);
    const mag2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y + v2.z*v2.z);
    return (Math.acos(dot / (mag1 * mag2))) * (180.0 / Math.PI);
}

function calcDist3D(a, b) {
    return Math.sqrt(Math.pow(a.x-b.x, 2) + Math.pow(a.y-b.y, 2) + Math.pow(a.z-b.z, 2));
}

function resizeCanvas(video, canvas) {
    if(video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    }
}
// Caché para evitar inferencias excesivas cuando el video está pausado
let cachedPose = { user: null, pro: null };
let cachedTime = { user: -1, pro: -1 };

// Bucle persistente: Dibuja frame, esqueleto y HUD en tiempo real
function syncCanvasLoop() {
    if (!isAnalyzing) {
        processFrame(userVideo, userCanvas, userCtx, 'user', false);
        processFrame(proVideo, proCanvas, proCtx, 'pro', false);
    }
    requestAnimationFrame(syncCanvasLoop);
}
syncCanvasLoop();

function processFrame(video, canvas, ctx, type, record = false) {
    if (video.videoWidth === 0) return;
    resizeCanvas(video, canvas);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    if (!poseLandmarker) return;

    let pose;
    if (video.currentTime !== cachedTime[type] || !video.paused) {
        pose = poseLandmarker.detect(video);
        cachedPose[type] = pose;
        cachedTime[type] = video.currentTime;
    } else {
        pose = cachedPose[type];
    }

    if (pose && pose.landmarks && pose.landmarks.length > 0) {
        const drawingUtils = new DrawingUtils(ctx);
        const color = type === 'user' ? '#3b82f6' : '#10b981'; // Azul y Verde
        
        // Escalar el tamaño de las líneas y nodos según la resolución nativa del vídeo
        // para que se vean del mismo grosor sin importar si es 480p o 4K
        const baseScale = Math.max(canvas.width, canvas.height) / 1000;
        const scaledLineWidth = Math.max(2, 3 * baseScale);
        const scaledRadius = Math.max(3, 4 * baseScale);
        const scaledBorder = Math.max(1.5, 2 * baseScale);
        
        for (const landmark of pose.landmarks) {
            drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS, { color: color, lineWidth: scaledLineWidth });
            drawingUtils.drawLandmarks(landmark, { radius: scaledRadius, color: '#ffffff', lineWidth: scaledBorder, fillColor: color });
        }

        // --- INICIO AUTO-FRAME (ROI Inteligente y Estable) ---
        const landmarks = pose.landmarks[0];
        // En lugar de usar los extremos (manos/pies) que hacen "bailar" la caja,
        // usamos el centro geométrico del torso (hombros y caderas) como ancla inamovible.
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        
        // Anclamos la X en el centro del torso, pero la Y la bajamos a las caderas
        // para asegurar que las piernas y la tabla entren perfectamente en el encuadre.
        const cx = (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4;
        const cy = (leftHip.y + rightHip.y) / 2;
        
        // La altura del torso nos da una referencia estable para el Zoom
        const torsoHeight = Math.max(0.05, Math.abs(cy - ((leftShoulder.y + rightShoulder.y)/2)));
        // Aumentamos la altura de la caja a 4 veces el torso para incluir la tabla entera
        const rh = Math.max(torsoHeight * 4.0, 0.1); 
        const rw = rh * 0.55; // Proporción visual fija ligeramente más ancha
        
        // --- CORRECCIÓN MATEMÁTICA DE LETTERBOXING ---
        // Como el vídeo tiene "object-fit: contain", puede tener bandas negras (letterboxing).
        // Si no compensamos esto, el cálculo de porcentajes falla y el rider "patina" por la pantalla.
        const wrapper = getE(`${type}Transform`);
        const wW = wrapper.clientWidth;
        const wH = wrapper.clientHeight;
        const vW = video.videoWidth;
        const vH = video.videoHeight;
        
        const fitScale = Math.min(wW / vW, wH / vH);
        const drawnW = vW * fitScale; // Ancho real del vídeo visible
        const drawnH = vH * fitScale; // Alto real del vídeo visible
        
        // Calculamos el Zoom para que el alto del rider (rh) ocupe exactamente el 55% de la pantalla
        let targetZ = (0.55 * wH) / (rh * drawnH); 
        targetZ = Math.max(1, Math.min(targetZ, 6)); // Límite de Zoom IA
        
        // Ajustamos la traslación multiplicándola por la proporción del vídeo visible frente al contenedor
        let targetPx = (drawnW / wW) * (0.5 - cx) * 100;
        let targetPy = (drawnH / wH) * (0.5 - cy) * 100;
        
        // Estabilización "Virtual Gimbal" (EMA) - Aumentado un poco para que sea más reactivo
        const smoothPos = 0.15;  // Fijación más firme al centro
        const smoothZoom = 0.05; // Ajuste de zoom moderado
        cameraState[type].z += (targetZ - cameraState[type].z) * smoothZoom;
        cameraState[type].x += (targetPx - cameraState[type].x) * smoothPos;
        cameraState[type].y += (targetPy - cameraState[type].y) * smoothPos;
        
        const autoFrameCb = getE(`${type}AutoFrame`);
        if (autoFrameCb && autoFrameCb.checked) {
            // Dibujar el ROI Tracker Visual
            ctx.save();
            ctx.strokeStyle = color; 
            ctx.lineWidth = 3;
            ctx.setLineDash([15, 10]); 
            
            const drawX = (cx - rw/2) * canvas.width;
            const drawY = (cy - rh/2) * canvas.height;
            const drawW = rw * canvas.width;
            const drawH = rh * canvas.height;
            
            ctx.strokeRect(drawX, drawY, drawW, drawH);
            
            ctx.fillStyle = color;
            ctx.font = "bold 16px Arial";
            ctx.fillText("STABLE ROI", drawX, drawY - 10);
            ctx.restore();

            updateTransform(type);
        }
        // --- FIN AUTO-FRAME ---

        if (pose.worldLandmarks && pose.worldLandmarks.length > 0) {
            const world = pose.worldLandmarks[0];
            const screenPts = pose.landmarks[0]; // Coordenadas 2D para render de texto anclado
            
            const hip = world[24]; const knee = world[26]; const ankle = world[28]; const foot = world[32];
            const shoulder = world[12]; const elbow = world[14]; const wrist = world[16];
            const nose = world[0];
            const verticalPoint = { x: hip.x, y: hip.y - 1.0, z: hip.z };
            const shoulderVertical = { x: shoulder.x, y: shoulder.y - 1.0, z: shoulder.z };
            const leftFootIdx = world[31]; const rightFootIdx = world[32];

            // 1. Calcular Ángulos Vectoriales 3D
            const kneeAng = calcAngle3D(hip, knee, ankle);
            const backAng = calcAngle3D(shoulder, hip, verticalPoint);
            const cgHeight = calcDist3D(hip, ankle) * 100; // rel. cm
            
            // Historial para calcular variación de CG (amplitud en último ciclo de bombeo ~1.5s)
            if (!window.cgHistory) window.cgHistory = { user: [], pro: [] };
            const currentTime = video.currentTime;
            window.cgHistory[type].push({ time: currentTime, val: cgHeight });
            // Mantener solo datos de los últimos 1.5s. Si el vídeo salta hacia atrás (loop), limpia el historial anterior.
            window.cgHistory[type] = window.cgHistory[type].filter(item => 
                currentTime >= item.time && currentTime - item.time <= 1.5
            );
            let cgVariation = 0;
            if (window.cgHistory[type].length > 5) {
                const vals = window.cgHistory[type].map(i => i.val);
                cgVariation = Math.max(...vals) - Math.min(...vals);
            }
            
            const ankleAng = calcAngle3D(knee, ankle, foot);
            const armAng = calcAngle3D(shoulder, elbow, wrist);
            const headAng = calcAngle3D(nose, shoulder, shoulderVertical);
            
            const distFeet = calcDist3D(leftFootIdx, rightFootIdx);
            const pitch = distFeet > 0 ? Math.asin(Math.abs(leftFootIdx.y - rightFootIdx.y) / distFeet) * (180.0 / Math.PI) : 0;

            // 2. Almacenar datos solo si se está grabando el análisis
            if (record) {
                analysisData[type].times.push(video.currentTime);
                analysisData[type].knee.push(kneeAng);
                analysisData[type].back.push(backAng);
                analysisData[type].cgHeight.push(cgHeight);
                analysisData[type].ankle.push(ankleAng);
                analysisData[type].arm.push(armAng);
                analysisData[type].head.push(headAng);
                analysisData[type].pitch.push(pitch);
            }

            // 3. RENDERIZADO VISUAL EN TIEMPO REAL (HUD)
            const hudMode = getE('hudMode').value;
            const overlay = getE(`${type}HudOverlay`);
            
            if (hudMode === 'none') {
                overlay.style.display = 'none';
            } else if (hudMode === 'corner') {
                overlay.style.display = 'block';
                overlay.innerHTML = `
                    <div class="hud-overlay-title" style="color:${color}">TELEMETRÍA ${type.toUpperCase()}</div>
                    <div class="hud-overlay-stat"><span>🏄 Tabla:</span> <span>${pitch.toFixed(1)}°</span></div>
                    <div class="hud-overlay-stat"><span>🦵 Rodilla:</span> <span>${kneeAng.toFixed(1)}°</span></div>
                    <div class="hud-overlay-stat"><span>🤸 Espalda:</span> <span>${backAng.toFixed(1)}°</span></div>
                    <div class="hud-overlay-stat"><span>💪 Brazos:</span> <span>${armAng.toFixed(1)}°</span></div>
                    <div class="hud-overlay-stat"><span>⚖️ Alt. CG:</span> <span>${cgHeight.toFixed(1)}cm</span></div>
                    <div class="hud-overlay-stat"><span title="Variación de Altura (Amplitud) en el último ciclo de 1.5s">↕️ Var. CG:</span> <span>${cgVariation.toFixed(1)}cm</span></div>
                `;
            } else if (hudMode === 'anchored') {
                overlay.style.display = 'none';
                ctx.save();
                // Utilidad para asegurar legibilidad usando trazo negro alrededor del texto blanco
                const drawText = (txt, x, y, col) => {
                    ctx.lineWidth = 3; ctx.strokeStyle = 'black'; ctx.strokeText(txt, x, y);
                    ctx.fillStyle = col || 'white'; ctx.fillText(txt, x, y);
                };

                // HUD Estilo Anclado al Cuerpo (Realidad Aumentada)
                ctx.font = `bold ${20 * (canvas.width/1280)}px Arial`;
                // Convertir de coordenadas relativas [0..1] a píxeles del canvas actual
                const toPx = (i) => ({ x: screenPts[i].x * canvas.width, y: screenPts[i].y * canvas.height });
                
                drawText(`🦵 ${kneeAng.toFixed(0)}°`, toPx(26).x + 15, toPx(26).y, color);
                drawText(`🤸 ${backAng.toFixed(0)}°`, toPx(24).x - 60, toPx(24).y, color);
                drawText(`⛵ ${pitch.toFixed(0)}°`, toPx(31).x, toPx(31).y + 30, color);
                drawText(`⚖️ ${cgHeight.toFixed(0)}cm`, toPx(24).x + 20, toPx(24).y - 20, color);
                drawText(`↕️ ${cgVariation.toFixed(0)}cm`, toPx(24).x + 20, toPx(24).y - 45, color);
                drawText(`💪 ${armAng.toFixed(0)}°`, toPx(14).x + 15, toPx(14).y, color);
                ctx.restore();
            }
        }
    }
}

async function renderLoop() {
    if (!isAnalyzing) return;

    let uFinished = userVideo.currentTime >= state.user.end || userVideo.paused;
    let pFinished = proVideo.currentTime >= state.pro.end || proVideo.paused;

    if (userVideo.currentTime >= state.user.end && !userVideo.paused) userVideo.pause();
    if (proVideo.currentTime >= state.pro.end && !proVideo.paused) proVideo.pause();

    if (!uFinished) processFrame(userVideo, userCanvas, userCtx, 'user', true);
    if (!pFinished) processFrame(proVideo, proCanvas, proCtx, 'pro', true);

    if (uFinished && pFinished) {
        isAnalyzing = false;
        playPauseBtn.innerText = '▶ Reiniciar Análisis 3D';
        playPauseBtn.disabled = false;
        generateDiagnosticReport();
    } else {
        animationId = requestAnimationFrame(renderLoop);
    }
}

// === PROCESAMIENTO DE SEÑALES TEMPORALES ===
function analyzeTemporal(arr, times) {
    if(arr.length < 5) return { cadence: 0, ascend: 0, descend: 0, ratio: 0, count: 0 };
    
    // Suavizado rápido
    let s = arr.map((val, i) => {
        let sum = 0, c = 0;
        for(let j=Math.max(0,i-2); j<=Math.min(arr.length-1,i+2); j++){ sum+=arr[j]; c++; }
        return sum/c;
    });

    let peaks = [], valleys = [];
    let trend = 0; // 1 up, -1 down
    let lastExtrema = s[0], lastType = null;
    let threshold = (Math.max(...s) - Math.min(...s)) * 0.15; // 15% de ruido ignorado

    for(let i=1; i<s.length; i++) {
        if (s[i] > s[i-1]) {
            if (trend === -1) {
                if (lastType !== 'valley' && (lastType === null || Math.abs(s[i-1] - lastExtrema) > threshold)) {
                    valleys.push({ val: s[i-1], time: times[i-1], type: 'V' });
                    lastExtrema = s[i-1]; lastType = 'valley';
                }
            }
            trend = 1;
        } else if (s[i] < s[i-1]) {
            if (trend === 1) {
                if (lastType !== 'peak' && (lastType === null || Math.abs(s[i-1] - lastExtrema) > threshold)) {
                    peaks.push({ val: s[i-1], time: times[i-1], type: 'P' });
                    lastExtrema = s[i-1]; lastType = 'peak';
                }
            }
            trend = -1;
        }
    }

    let ascendTimes = [], descendTimes = [];
    let seq = [...peaks, ...valleys].sort((a,b) => a.time - b.time);
    
    for(let i=0; i<seq.length-1; i++) {
        let diff = seq[i+1].time - seq[i].time;
        // Peak a Valley = Descend (Compresión)
        if(seq[i].type === 'P' && seq[i+1].type === 'V') descendTimes.push(diff);
        // Valley a Peak = Ascend (Extensión)
        if(seq[i].type === 'V' && seq[i+1].type === 'P') ascendTimes.push(diff);
    }

    let avgAscend = ascendTimes.length ? ascendTimes.reduce((a,b)=>a+b)/ascendTimes.length : 0;
    let avgDescend = descendTimes.length ? descendTimes.reduce((a,b)=>a+b)/descendTimes.length : 0;
    
    let totalTime = times[times.length-1] - times[0];
    let cadence = (valleys.length > 0 && totalTime > 0) ? (valleys.length / totalTime) * 60 : 0; // Pumps Per Minute
    let ratio = avgDescend > 0 ? (avgAscend / avgDescend) : 0;

    return { 
        cadence: Math.round(cadence), 
        ascend: avgAscend.toFixed(2), descend: avgDescend.toFixed(2), 
        ratio: ratio.toFixed(2), count: valleys.length 
    };
}

function getStats(arr) {
    if (arr.length === 0) return { min: 0, max: 0, avg: 0, range: 0 };
    let min = Math.min(...arr); let max = Math.max(...arr); 
    return { min: Math.round(min), max: Math.round(max), avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), range: Math.round(max - min) };
}

function generateDiagnosticReport() {
    // Spatial
    const uKnee = getStats(analysisData.user.knee); const pKnee = getStats(analysisData.pro.knee);
    const uBack = getStats(analysisData.user.back); const pBack = getStats(analysisData.pro.back);
    const uCG = getStats(analysisData.user.cgHeight); const pCG = getStats(analysisData.pro.cgHeight);
    const uAnkle = getStats(analysisData.user.ankle); const pAnkle = getStats(analysisData.pro.ankle);
    const uArm = getStats(analysisData.user.arm); const pArm = getStats(analysisData.pro.arm);
    const uHead = getStats(analysisData.user.head); const pHead = getStats(analysisData.pro.head);
    const uPitch = getStats(analysisData.user.pitch); const pPitch = getStats(analysisData.pro.pitch);

    // Temporal
    const uTemp = analyzeTemporal(analysisData.user.cgHeight, analysisData.user.times);
    const pTemp = analyzeTemporal(analysisData.pro.cgHeight, analysisData.pro.times);

    // Generador de Tarjetas KPI Visuales
    const kpi = (title, uVal, pVal, unit) => {
        const numU = parseFloat(uVal) || 0;
        const numP = parseFloat(pVal) || 0;
        const delta = Math.abs(numU - numP).toFixed(1);
        const max = Math.max(numU, numP) * 1.2 || 1; 
        const uPct = Math.min(100, (numU / max) * 100);
        const pPct = Math.min(100, (numP / max) * 100);
        
        return `
        <div class="kpi-card">
            <div class="kpi-title">${title}</div>
            <div class="kpi-data">
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <div class="kpi-stat u-stat"><span class="kpi-label">Tú</span> ${uVal}${unit}</div>
                    <div class="kpi-stat p-stat"><span class="kpi-label">PRO</span> ${pVal}${unit}</div>
                </div>
                <div class="kpi-delta">Δ ${delta}${unit}</div>
            </div>
            <div class="kpi-bars">
                <div class="kpi-bar-wrap"><div class="kpi-bar u-bar" style="width: ${uPct}%"></div></div>
                <div class="kpi-bar-wrap"><div class="kpi-bar p-bar" style="width: ${pPct}%"></div></div>
            </div>
        </div>`;
    };

    let html = `<h3>📊 Dashboard de Telemetría Biomecánica</h3>`;

    html += `<div class="kpi-section-title">⏱️ Ritmo y Temporalidad</div><div class="kpi-grid">`;
    html += kpi('Cadencia', uTemp.cadence, pTemp.cadence, ' PPM');
    html += kpi('T. Compresión', uTemp.descend, pTemp.descend, 's');
    html += kpi('T. Extensión', uTemp.ascend, pTemp.ascend, 's');
    html += kpi('Ratio Subida/Bajada', uTemp.ratio, pTemp.ratio, '');
    html += `</div>`;

    html += `<div class="kpi-section-title">🏄 Tabla y Gravedad</div><div class="kpi-grid">`;
    html += kpi('Inclinación Tabla', uPitch.avg, pPitch.avg, '°');
    html += kpi('Rango de Cabeceo', uPitch.range, pPitch.range, '°');
    html += kpi('Amplitud Vertical CG', uCG.range, pCG.range, ' cm');
    html += `</div>`;

    html += `<div class="kpi-section-title">🦵 Piernas y Postura Base</div><div class="kpi-grid">`;
    html += kpi('Flexión de Rodilla', uKnee.min, pKnee.min, '°');
    html += kpi('Dorsiflexión Tobillo', uAnkle.avg, pAnkle.avg, '°');
    html += `</div>`;

    html += `<div class="kpi-section-title">🤸 Torso y Péndulo</div><div class="kpi-grid">`;
    html += kpi('Inclinación Espalda', uBack.avg, pBack.avg, '°');
    html += kpi('Rango de Brazos', uArm.range, pArm.range, '°');
    html += kpi('Alineación Cabeza', uHead.avg, pHead.avg, '°');
    html += `</div>`;

    diagnosticReport.innerHTML = html;
}

playPauseBtn.addEventListener('click', async () => {
    if (!poseLandmarker) return alert("Espera a que cargue la IA.");
    
    // Detener modo bucle si está activo
    isLooping = false; cancelAnimationFrame(loopAnimId);
    userVideo.playbackRate = 1.0; proVideo.playbackRate = 1.0;
    getE('playLoopBtn').innerText = '🔄 Comparación Sincronizada'; getE('playLoopBtn').style.backgroundColor = 'var(--accent-hover)';
    
    analysisData = { user: { times: [], knee: [], back: [], cgHeight: [], ankle: [], arm: [], head: [], pitch: [] }, pro: { times: [], knee: [], back: [], cgHeight: [], ankle: [], arm: [], head: [], pitch: [] } };
    diagnosticReport.innerHTML = '<p class="waiting-text">Sincronizando vídeos al punto de inicio...</p>';
    playPauseBtn.innerText = '⏳ Sincronizando...'; playPauseBtn.disabled = true;

    // Promesa para asegurar que el vídeo llega al frame exacto antes de leer el canvas
    const seekVideo = (vid, time) => new Promise(resolve => {
        if (Math.abs(vid.currentTime - time) < 0.02) return resolve();
        const onSeeked = () => { vid.removeEventListener('seeked', onSeeked); resolve(); };
        vid.addEventListener('seeked', onSeeked);
        vid.currentTime = time;
    });

    await Promise.all([
        seekVideo(userVideo, state.user.start),
        seekVideo(proVideo, state.pro.start)
    ]);

    diagnosticReport.innerHTML = '<p class="waiting-text">Procesando vectores y extrayendo métricas temporales...</p>';
    isAnalyzing = true; 
    playPauseBtn.innerText = '⏳ Procesando Análisis Integral...';
    
    userVideo.play(); proVideo.play();
    if (animationId) cancelAnimationFrame(animationId);
    renderLoop();
});

initializeMediaPipe();

function makeDraggable(el) {
    if(!el) return;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    el.onmousedown = dragMouseDown;
    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}
makeDraggable(getE('userHudOverlay'));
makeDraggable(getE('proHudOverlay'));

function setupDraggableMarkers(type) {
    const container = getE(type + 'Scrubber').parentElement;
    const startMarker = getE(type + 'StartMarker');
    const endMarker = getE(type + 'EndMarker');
    const video = type === 'user' ? userVideo : proVideo;

    function attachDrag(marker, isStart) {
        if (!marker) return;
        let isDragging = false;
        
        marker.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.preventDefault(); 
            e.stopPropagation(); 
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging || !video.duration) return;
            const rect = container.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            
            let newTime = (x / rect.width) * video.duration;
            
            if (isStart) {
                state[type].start = Math.min(newTime, state[type].endSet ? state[type].end - 0.05 : video.duration);
                state[type].startSet = true;
                video.currentTime = state[type].start;
            } else {
                state[type].end = Math.max(newTime, state[type].startSet ? state[type].start + 0.05 : 0);
                state[type].endSet = true;
                video.currentTime = state[type].end;
            }
            updateTimeSpan(type);
            updateScrubberHighlight(type);
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                saveConfig();
            }
        });
    }
    
    attachDrag(startMarker, true);
    attachDrag(endMarker, false);
}
setupDraggableMarkers('user');
setupDraggableMarkers('pro');
