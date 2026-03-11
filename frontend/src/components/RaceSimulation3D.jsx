import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { F1CarGLB } from './F1CarModel';

// ─── Constants ───────────────────────────────────────────────────────────────
const SPEED_MULTIPLIER = [1, 2, 5, 10, 20];
const TRACK_HALF_W = 1.8;
const CAR_SCALE = 0.55;

function normaliseTrack3D(trackMap, targetSize = 100) {
    if (!trackMap || trackMap.length < 2) return null;
    const xs = trackMap.map(p => p[0]);
    const ys = trackMap.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = targetSize / Math.max(rangeX, rangeY);
    const midX = (maxX + minX) / 2;
    const midY = (maxY + minY) / 2;
    const points = trackMap.map(([x, y]) => new THREE.Vector3(
        (x - midX) * scale, 0, -(y - midY) * scale
    ));
    return new THREE.CatmullRomCurve3(points, true);
}

function buildTimeline(laps) {
    let cum = 0;
    const times = [0];
    for (const lap of laps) { cum += lap.time; times.push(cum); }
    return { cumulativeTimes: times, totalTime: cum };
}

function getTrackFraction(elapsed, cumulativeTimes) {
    if (elapsed <= 0) return 0;
    const total = cumulativeTimes[cumulativeTimes.length - 1];
    if (elapsed >= total) return 1;
    let lapIdx = 0;
    for (let i = 1; i < cumulativeTimes.length; i++) {
        if (elapsed < cumulativeTimes[i]) { lapIdx = i - 1; break; }
    }
    const lapStart = cumulativeTimes[lapIdx];
    const lapEnd = cumulativeTimes[lapIdx + 1] || lapStart + 90;
    const lapDuration = lapEnd - lapStart;
    return lapDuration > 0 ? (elapsed - lapStart) / lapDuration : 0;
}

function getLapNumber(elapsed, cumulativeTimes) {
    if (elapsed <= 0) return 1;
    for (let i = 1; i < cumulativeTimes.length; i++) {
        if (elapsed < cumulativeTimes[i]) return i;
    }
    return cumulativeTimes.length - 1;
}

function formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Helper: compute curvature at each sample point ──────────────────────────
function computeCurvatures(curve, segments = 500) {
    const curvatures = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const dt = 0.001;
        const t0 = Math.max(0, t - dt);
        const t1 = Math.min(1, t + dt);
        const tan0 = curve.getTangentAt(t0);
        const tan1 = curve.getTangentAt(t1);
        const diff = new THREE.Vector3().subVectors(tan1, tan0);
        const c = diff.length() / (2 * dt);
        curvatures.push(c);
    }
    return curvatures;
}

// ─── 2024 F1 Team Livery Definitions ─────────────────────────────────────────
// Each zone maps to a part of the car:
//   body    → main monocoque / survival cell
//   nose    → nose cone
//   engine  → engine cover / airbox
//   sidepod → sidepods
//   wing    → front & rear wings, halo
//   accent  → racing stripe, DRS flap highlight
//   wingEnd → wing endplates
// Each entry maps to GLB model materials:
//   body      → "paints" material (main livery color)
//   secondary → "detail" material (secondary body color)
//   carbon    → "carbon" material tint
//   accent    → "drivercolor" material (t-cam, highlights)
//   wing      → used for procedural fallback
const TEAM_LIVERIES = {
    'Red Bull Racing': {
        body:      '#3671C6',  // official RBR blue
        secondary: '#1B264F',  // dark navy accents
        carbon:    '#1B264F',  // navy carbon
        accent:    '#FDD900',  // yellow
        wing:      '#CC1122',  // red wings
        wingEnd:   '#CC1122',
        nose:      '#FDD900',
        engine:    '#1B264F',
        sidepod:   '#3671C6',
        matte: true,
    },
    'Ferrari': {
        body:      '#E8002D',  // rosso corsa 2024
        secondary: '#E8002D',
        carbon:    '#1a1a1a',  // black carbon
        accent:    '#FFEB00',  // yellow accent
        wing:      '#1a1a1a',
        wingEnd:   '#E8002D',
        nose:      '#E8002D',
        engine:    '#E8002D',
        sidepod:   '#E8002D',
    },
    'Mercedes': {
        body:      '#27F4D2',  // petronas teal 2024
        secondary: '#000000',  // black
        carbon:    '#000000',
        accent:    '#27F4D2',  // teal highlights
        wing:      '#000000',
        wingEnd:   '#000000',
        nose:      '#C8CCCE',  // silver
        engine:    '#000000',
        sidepod:   '#000000',
    },
    'McLaren': {
        body:      '#FF8000',  // papaya orange 2024
        secondary: '#1a1a1a',  // anthracite
        carbon:    '#1a1a1a',
        accent:    '#47C7FC',  // fluro blue accent
        wing:      '#1a1a1a',
        wingEnd:   '#FF8000',
        nose:      '#FF8000',
        engine:    '#1a1a1a',
        sidepod:   '#1a1a1a',
    },
    'Aston Martin': {
        body:      '#229971',  // AMR24 green 2024
        secondary: '#006F62',
        carbon:    '#0A3A2A',  // dark green carbon
        accent:    '#CEDC00',  // lime yellow
        wing:      '#006F62',
        wingEnd:   '#006F62',
        nose:      '#229971',
        engine:    '#006F62',
        sidepod:   '#229971',
    },
    'Alpine': {
        body:      '#0093CC',  // alpine blue 2024
        secondary: '#FF69B4',  // BWT pink
        carbon:    '#1a1a1a',
        accent:    '#FF69B4',  // pink accent
        wing:      '#1a1a1a',
        wingEnd:   '#0093CC',
        nose:      '#0093CC',
        engine:    '#1a1a1a',
        sidepod:   '#FF69B4',
    },
    'Williams': {
        body:      '#64C4FF',  // williams blue 2024 (lighter)
        secondary: '#005AFF',  // deep blue
        carbon:    '#012B5C',  // dark navy carbon
        accent:    '#E87722',  // gulf-inspired orange
        wing:      '#005AFF',
        wingEnd:   '#005AFF',
        nose:      '#64C4FF',
        engine:    '#012B5C',
        sidepod:   '#005AFF',
    },
    'RB': {
        body:      '#6692FF',  // VCARB blue 2024
        secondary: '#FFFFFF',  // white
        carbon:    '#1a1a1a',
        accent:    '#FF3C38',  // VCARB red
        wing:      '#FFFFFF',
        wingEnd:   '#FF3C38',
        nose:      '#FFFFFF',
        engine:    '#2B4562',
        sidepod:   '#6692FF',
    },
    'Kick Sauber': {
        body:      '#52E252',  // stake green 2024
        secondary: '#1a1a1a',
        carbon:    '#1a1a1a',
        accent:    '#00E701',  // neon green
        wing:      '#1a1a1a',
        wingEnd:   '#52E252',
        nose:      '#52E252',
        engine:    '#1a1a1a',
        sidepod:   '#1a1a1a',
    },
    'Haas F1 Team': {
        body:      '#B6BABD',  // silver-grey 2024
        secondary: '#1a1a1a',  // black
        carbon:    '#1a1a1a',
        accent:    '#E10600',  // red
        wing:      '#1a1a1a',
        wingEnd:   '#1a1a1a',
        nose:      '#FFFFFF',
        engine:    '#1a1a1a',
        sidepod:   '#B6BABD',
    },
};



/** Create a MeshPhysicalMaterial for a given hex color */
function makePaint(hex, finished, isMatte = false) {
    const c = new THREE.Color(hex);
    return new THREE.MeshPhysicalMaterial({
        color: c,
        roughness: isMatte ? 0.45 : 0.15,
        metalness: isMatte ? 0.3 : 0.8,
        clearcoat: isMatte ? 0.2 : 1.0,
        clearcoatRoughness: isMatte ? 0.4 : 0.05,
        emissive: c,
        emissiveIntensity: 0.06,
        transparent: finished,
        opacity: finished ? 0.3 : 1,
    });
}

function makeAccent(hex, finished) {
    const c = new THREE.Color(hex);
    return new THREE.MeshPhysicalMaterial({
        color: c,
        roughness: 0.15,
        metalness: 0.9,
        clearcoat: 1.0,
        emissive: c,
        emissiveIntensity: 0.2,
        transparent: finished,
        opacity: finished ? 0.3 : 1,
    });
}

// ─── 3D Components ──────────────────────────────────────────────────────────

/** Procedural F1 Car with 2024 team-specific liveries */
function F1Car({ color, team, isHero, code, number, finished }) {
    const livery = TEAM_LIVERIES[team];
    const isMatte = livery?.matte || false;

    // Zone-specific materials
    const bodyMat    = useMemo(() => makePaint(livery?.body    || color, finished, isMatte), [livery, color, finished]);
    const noseMat    = useMemo(() => makePaint(livery?.nose    || livery?.body || color, finished, isMatte), [livery, color, finished]);
    const engineMat  = useMemo(() => makePaint(livery?.engine  || livery?.body || color, finished, isMatte), [livery, color, finished]);
    const sidepodMat = useMemo(() => makePaint(livery?.sidepod || livery?.body || color, finished, isMatte), [livery, color, finished]);
    const wingMat    = useMemo(() => makePaint(livery?.wing    || '#1c1c1c', finished), [livery, finished]);
    const wingEndMat = useMemo(() => makePaint(livery?.wingEnd || livery?.wing || '#1c1c1c', finished), [livery, finished]);
    const accentMat  = useMemo(() => makeAccent(livery?.accent || color, finished), [livery, color, finished]);

    const tireMat = useMemo(() => new THREE.MeshPhysicalMaterial({
        color: '#1a1a1a', roughness: 0.95, metalness: 0.0,
        transparent: finished, opacity: finished ? 0.3 : 1,
    }), [finished]);

    const haloMat = useMemo(() => new THREE.MeshPhysicalMaterial({
        color: '#2a2a2a', roughness: 0.3, metalness: 0.5,
        clearcoat: 0.8,
        transparent: finished, opacity: finished ? 0.3 : 1,
    }), [finished]);

    return (
        <group scale={CAR_SCALE}>
            {/* ── Survival Cell / Monocoque ── */}
            <mesh position={[0, 0.22, 0.1]} material={bodyMat} castShadow>
                <boxGeometry args={[0.65, 0.28, 2.0]} />
            </mesh>

            {/* ── Nose Cone ── */}
            <mesh position={[0, 0.16, 1.5]} material={noseMat} castShadow>
                <boxGeometry args={[0.3, 0.14, 0.9]} />
            </mesh>

            {/* ── Engine Cover / Airbox ── */}
            <mesh position={[0, 0.45, -0.2]} material={engineMat} castShadow>
                <boxGeometry args={[0.45, 0.22, 1.1]} />
            </mesh>

            {/* ── Accent Racing Stripe ── */}
            <mesh position={[0, 0.37, 0.5]} material={accentMat}>
                <boxGeometry args={[0.66, 0.02, 1.2]} />
            </mesh>

            {/* ── Sidepods ── */}
            <mesh position={[-0.42, 0.2, -0.1]} material={sidepodMat} castShadow>
                <boxGeometry args={[0.22, 0.2, 1.0]} />
            </mesh>
            <mesh position={[0.42, 0.2, -0.1]} material={sidepodMat} castShadow>
                <boxGeometry args={[0.22, 0.2, 1.0]} />
            </mesh>

            {/* ── Front Wing ── */}
            <mesh position={[0, 0.06, 2.0]} material={wingMat} castShadow>
                <boxGeometry args={[1.5, 0.03, 0.3]} />
            </mesh>
            {/* Front wing endplates */}
            <mesh position={[-0.72, 0.08, 2.0]} material={wingEndMat}>
                <boxGeometry args={[0.03, 0.1, 0.28]} />
            </mesh>
            <mesh position={[0.72, 0.08, 2.0]} material={wingEndMat}>
                <boxGeometry args={[0.03, 0.1, 0.28]} />
            </mesh>

            {/* ── Rear Wing ── */}
            <mesh position={[0, 0.62, -1.0]} material={wingMat} castShadow>
                <boxGeometry args={[1.3, 0.03, 0.35]} />
            </mesh>
            <mesh position={[-0.6, 0.44, -1.0]} material={wingEndMat}>
                <boxGeometry args={[0.03, 0.4, 0.3]} />
            </mesh>
            <mesh position={[0.6, 0.44, -1.0]} material={wingEndMat}>
                <boxGeometry args={[0.03, 0.4, 0.3]} />
            </mesh>

            {/* ── DRS Flap accent ── */}
            <mesh position={[0, 0.65, -1.0]} material={accentMat}>
                <boxGeometry args={[1.28, 0.015, 0.15]} />
            </mesh>

            {/* ── Tires ── FL FR RL RR */}
            {[
                [-0.58, 0.18, 1.2, 0.18, 0.22],
                [0.58, 0.18, 1.2, 0.18, 0.22],
                [-0.58, 0.22, -0.85, 0.22, 0.28],
                [0.58, 0.22, -0.85, 0.22, 0.28],
            ].map(([x, y, z, r, w], i) => (
                <mesh key={i} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} material={tireMat} castShadow>
                    <cylinderGeometry args={[r, r, w, 16]} />
                </mesh>
            ))}

            {/* ── Halo ── */}
            <mesh position={[0, 0.42, 0.6]} material={haloMat}>
                <boxGeometry args={[0.06, 0.12, 0.7]} />
            </mesh>

            {/* Hero glow */}
            {isHero && (
                <pointLight distance={12} intensity={4} color={livery?.accent || color} position={[0, 1.5, 0]} />
            )}

            {/* Label */}
            <Html position={[0, 1.8, 0]} center zIndexRange={[100, 0]}>
                <div style={{
                    background: isHero ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)',
                    border: isHero ? `1.5px solid ${livery?.accent || color}` : '1px solid rgba(255,255,255,0.15)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: '#fff',
                    fontWeight: isHero ? '800' : '600',
                    fontSize: isHero ? '11px' : '9px',
                    fontFamily: 'Inter, sans-serif',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    opacity: finished ? 0.3 : 1,
                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                }}>
                    {number ? `#${number} ` : ''}{code}
                </div>
            </Html>
        </group>
    );
}

/** Track Surface — flat ribbon + white edges + kerbs on high-curvature sections */
function Track({ curve }) {
    const segments = 600;

    // Precomputed data arrays
    const { positions, normals: trackNormals, curvatures } = useMemo(() => {
        const pts = [];
        const norms = [];
        const curvs = computeCurvatures(curve, segments);

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
            pts.push(point);
            norms.push(normal);
        }
        return { positions: pts, normals: norms, curvatures: curvs };
    }, [curve, segments]);

    // Asphalt ribbon
    const asphaltGeom = useMemo(() => {
        const verts = [];
        const indices = [];
        for (let i = 0; i <= segments; i++) {
            const p = positions[i];
            const n = trackNormals[i];
            const l = p.clone().add(n.clone().multiplyScalar(TRACK_HALF_W));
            const r = p.clone().add(n.clone().multiplyScalar(-TRACK_HALF_W));
            l.y = 0.005; r.y = 0.005;
            verts.push(l.x, l.y, l.z, r.x, r.y, r.z);
            if (i < segments) {
                const b = i * 2;
                indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        return g;
    }, [positions, trackNormals, segments]);

    // White edge lines (left + right)
    const { leftEdge, rightEdge } = useMemo(() => {
        const lPts = [], rPts = [];
        for (let i = 0; i <= segments; i++) {
            const p = positions[i];
            const n = trackNormals[i];
            const l = p.clone().add(n.clone().multiplyScalar(TRACK_HALF_W + 0.05));
            const r = p.clone().add(n.clone().multiplyScalar(-TRACK_HALF_W - 0.05));
            l.y = 0.02; r.y = 0.02;
            lPts.push(l);
            rPts.push(r);
        }
        return {
            leftEdge: new THREE.BufferGeometry().setFromPoints(lPts),
            rightEdge: new THREE.BufferGeometry().setFromPoints(rPts),
        };
    }, [positions, trackNormals, segments]);

    // Kerbs — red-white strips at high-curvature sections
    const kerbMeshes = useMemo(() => {
        // Find curvature threshold — top 15%
        const sorted = [...curvatures].sort((a, b) => b - a);
        const threshold = sorted[Math.floor(sorted.length * 0.12)] || 0.5;

        const kerbs = [];
        let inKerb = false;
        let kerbStart = 0;

        for (let i = 0; i <= segments; i++) {
            const isHigh = curvatures[i] > threshold;
            if (isHigh && !inKerb) {
                inKerb = true;
                kerbStart = i;
            } else if (!isHigh && inKerb) {
                inKerb = false;
                const kerbLen = i - kerbStart;
                if (kerbLen > 3) { // skip very short kerbs
                    kerbs.push({ start: kerbStart, end: i });
                }
            }
        }
        if (inKerb) kerbs.push({ start: kerbStart, end: segments });

        // Build kerb geometry for each section
        const kerbObjs = [];
        const kerbW = 0.3;

        for (const kerb of kerbs) {
            const verts = [];
            const colors = [];
            const indices = [];

            for (let i = kerb.start; i <= kerb.end; i++) {
                const p = positions[i];
                const n = trackNormals[i];

                // Outer kerb (left side)
                const lo = p.clone().add(n.clone().multiplyScalar(TRACK_HALF_W));
                const loOut = p.clone().add(n.clone().multiplyScalar(TRACK_HALF_W + kerbW));
                lo.y = 0.015; loOut.y = 0.025;

                // Inner kerb (right side)
                const ri = p.clone().add(n.clone().multiplyScalar(-TRACK_HALF_W));
                const riOut = p.clone().add(n.clone().multiplyScalar(-TRACK_HALF_W - kerbW));
                ri.y = 0.015; riOut.y = 0.025;

                // Alternating red/white
                const stripeIdx = Math.floor((i - kerb.start) / 3);
                const isRed = stripeIdx % 2 === 0;
                const r = isRed ? 0.85 : 0.95;
                const g = isRed ? 0.05 : 0.95;
                const b = isRed ? 0.05 : 0.95;

                // Left kerb verts
                verts.push(lo.x, lo.y, lo.z, loOut.x, loOut.y, loOut.z);
                colors.push(r, g, b, r, g, b);

                // Right kerb verts
                verts.push(ri.x, ri.y, ri.z, riOut.x, riOut.y, riOut.z);
                colors.push(r, g, b, r, g, b);
            }

            const count = kerb.end - kerb.start + 1;
            for (let i = 0; i < count - 1; i++) {
                const base = i * 4;
                // Left kerb face
                indices.push(base, base + 1, base + 4, base + 1, base + 5, base + 4);
                // Right kerb face
                indices.push(base + 2, base + 3, base + 6, base + 3, base + 7, base + 6);
            }

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geom.setIndex(indices);
            geom.computeVertexNormals();
            kerbObjs.push(geom);
        }

        return kerbObjs;
    }, [positions, trackNormals, curvatures, segments]);

    // ── Start / Finish line: chequered bar across the track at t=0 ────
    const startFinishGeom = useMemo(() => {
        const p = positions[0];
        const n = trackNormals[0];
        const w = TRACK_HALF_W + 0.4;
        const depth = 0.5;
        const tangent = curve.getTangentAt(0).normalize();

        const verts = [];
        const colors = [];
        const indices = [];
        const cols = 8;
        const rows = 2;
        const cellW = (w * 2) / cols;
        const cellD = depth / rows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const isBlack = (r + c) % 2 === 0;
                const cr = isBlack ? 0.05 : 0.95;
                const cg = isBlack ? 0.05 : 0.95;
                const cb = isBlack ? 0.05 : 0.95;

                // 4 corners of this cell
                const baseLeft = -w + c * cellW;
                const baseRight = baseLeft + cellW;
                const baseFront = -depth / 2 + r * cellD;
                const baseBack = baseFront + cellD;

                // Map into world space
                const corners = [
                    [baseLeft, baseFront], [baseRight, baseFront],
                    [baseRight, baseBack], [baseLeft, baseBack],
                ];
                const idx = verts.length / 3;
                for (const [across, along] of corners) {
                    const pos = p.clone()
                        .add(n.clone().multiplyScalar(across))
                        .add(tangent.clone().multiplyScalar(along));
                    pos.y = 0.03;
                    verts.push(pos.x, pos.y, pos.z);
                    colors.push(cr, cg, cb);
                }
                indices.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
            }
        }

        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        return g;
    }, [positions, trackNormals, curve]);

    // ── Sector divider bars (S1/S2/S3) ───────────────────────────────
    const sectorBars = useMemo(() => {
        const sectorPositions = [0.0, 0.333, 0.666];
        const sectorColors = ['#E10600', '#00D2BE', '#FFC700']; // Red, Teal, Yellow
        const sectorLabels = ['S1', 'S2', 'S3'];
        const barWidth = TRACK_HALF_W + 0.6;
        const barDepth = 0.15;

        return sectorPositions.map((st, idx) => {
            const segIdx = Math.round(st * segments);
            const p = positions[segIdx] || positions[0];
            const n = trackNormals[segIdx] || trackNormals[0];
            const tangent = curve.getTangentAt(st).normalize();

            const left = p.clone().add(n.clone().multiplyScalar(barWidth));
            const right = p.clone().add(n.clone().multiplyScalar(-barWidth));
            const leftFwd = left.clone().add(tangent.clone().multiplyScalar(barDepth));
            const rightFwd = right.clone().add(tangent.clone().multiplyScalar(barDepth));

            [left, right, leftFwd, rightFwd].forEach(v => { v.y = 0.025; });

            const verts = [
                left.x, left.y, left.z,
                right.x, right.y, right.z,
                rightFwd.x, rightFwd.y, rightFwd.z,
                leftFwd.x, leftFwd.y, leftFwd.z,
            ];

            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            g.setIndex([0, 1, 2, 0, 2, 3]);
            g.computeVertexNormals();

            // Label anchor — slightly above track
            const labelPos = p.clone().add(n.clone().multiplyScalar(barWidth + 1.5));
            labelPos.y = 1.5;

            return { geom: g, color: sectorColors[idx], label: sectorLabels[idx], labelPos };
        });
    }, [positions, trackNormals, curve, segments]);

    // ── DRS zones (long straights — low curvature segments) ──────────
    const drsZones = useMemo(() => {
        // Low-curvature threshold = bottom 20%
        const sorted = [...curvatures].sort((a, b) => a - b);
        const threshold = sorted[Math.floor(sorted.length * 0.20)] || 0.1;

        const zones = [];
        let inZone = false;
        let zStart = 0;

        for (let i = 0; i <= segments; i++) {
            const isLow = curvatures[i] < threshold;
            if (isLow && !inZone) { inZone = true; zStart = i; }
            else if (!isLow && inZone) {
                inZone = false;
                if (i - zStart > 15) zones.push({ start: zStart, end: i }); // minimum length
            }
        }
        if (inZone && segments - zStart > 15) zones.push({ start: zStart, end: segments });

        // Build green-tinted overlay strips for each DRS zone
        return zones.map((zone, zoneIdx) => {
            const verts = [];
            const indices = [];
            for (let i = zone.start; i <= zone.end; i++) {
                const p = positions[i];
                const n = trackNormals[i];
                const l = p.clone().add(n.clone().multiplyScalar(TRACK_HALF_W - 0.1));
                const r = p.clone().add(n.clone().multiplyScalar(-TRACK_HALF_W + 0.1));
                l.y = 0.012; r.y = 0.012;
                verts.push(l.x, l.y, l.z, r.x, r.y, r.z);
                if (i < zone.end) {
                    const b = (i - zone.start) * 2;
                    indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
                }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            g.setIndex(indices);
            g.computeVertexNormals();

            // DRS label position — middle of the zone
            const midIdx = Math.floor((zone.start + zone.end) / 2);
            const midP = positions[midIdx];
            const midN = trackNormals[midIdx];
            const labelPos = midP.clone().add(midN.clone().multiplyScalar(TRACK_HALF_W + 2));
            labelPos.y = 1.8;

            // ── Detection line at zone START ──
            const sP = positions[zone.start];
            const sN = trackNormals[zone.start];
            const sTan = curve.getTangentAt(zone.start / segments).normalize();
            const detLineVerts = [];
            const detLeft = sP.clone().add(sN.clone().multiplyScalar(TRACK_HALF_W));
            const detRight = sP.clone().add(sN.clone().multiplyScalar(-TRACK_HALF_W));
            const detLeftFwd = detLeft.clone().add(sTan.clone().multiplyScalar(0.2));
            const detRightFwd = detRight.clone().add(sTan.clone().multiplyScalar(0.2));
            [detLeft, detRight, detLeftFwd, detRightFwd].forEach(v => { v.y = 0.03; });
            detLineVerts.push(
                detLeft.x, detLeft.y, detLeft.z,
                detRight.x, detRight.y, detRight.z,
                detRightFwd.x, detRightFwd.y, detRightFwd.z,
                detLeftFwd.x, detLeftFwd.y, detLeftFwd.z
            );
            const detGeom = new THREE.BufferGeometry();
            detGeom.setAttribute('position', new THREE.Float32BufferAttribute(detLineVerts, 3));
            detGeom.setIndex([0, 1, 2, 0, 2, 3]);
            detGeom.computeVertexNormals();

            // ── Activation line at zone END ──
            const eP = positions[zone.end] || positions[zone.end - 1];
            const eN = trackNormals[zone.end] || trackNormals[zone.end - 1];
            const eTanT = Math.min((zone.end) / segments, 0.999);
            const eTan = curve.getTangentAt(eTanT).normalize();
            const actLineVerts = [];
            const actLeft = eP.clone().add(eN.clone().multiplyScalar(TRACK_HALF_W));
            const actRight = eP.clone().add(eN.clone().multiplyScalar(-TRACK_HALF_W));
            const actLeftFwd = actLeft.clone().add(eTan.clone().multiplyScalar(0.2));
            const actRightFwd = actRight.clone().add(eTan.clone().multiplyScalar(0.2));
            [actLeft, actRight, actLeftFwd, actRightFwd].forEach(v => { v.y = 0.03; });
            actLineVerts.push(
                actLeft.x, actLeft.y, actLeft.z,
                actRight.x, actRight.y, actRight.z,
                actRightFwd.x, actRightFwd.y, actRightFwd.z,
                actLeftFwd.x, actLeftFwd.y, actLeftFwd.z
            );
            const actGeom = new THREE.BufferGeometry();
            actGeom.setAttribute('position', new THREE.Float32BufferAttribute(actLineVerts, 3));
            actGeom.setIndex([0, 1, 2, 0, 2, 3]);
            actGeom.computeVertexNormals();

            return {
                geom: g,
                labelPos,
                zoneNumber: zoneIdx + 1,
                detectionLineGeom: detGeom,
                activationLineGeom: actGeom,
            };
        });
    }, [positions, trackNormals, curvatures, segments, curve]);

    return (
        <group>
            {/* Asphalt */}
            <mesh geometry={asphaltGeom} receiveShadow>
                <meshStandardMaterial color="#2a2a2a" roughness={0.85} side={THREE.DoubleSide} />
            </mesh>

            {/* White edge lines */}
            <line geometry={leftEdge}>
                <lineBasicMaterial color="#ffffff" opacity={0.7} transparent />
            </line>
            <line geometry={rightEdge}>
                <lineBasicMaterial color="#ffffff" opacity={0.7} transparent />
            </line>

            {/* Kerbs */}
            {kerbMeshes.map((geom, i) => (
                <mesh key={`kerb-${i}`} geometry={geom}>
                    <meshStandardMaterial vertexColors roughness={0.6} side={THREE.DoubleSide} />
                </mesh>
            ))}

            {/* Start / Finish chequered line */}
            <mesh geometry={startFinishGeom}>
                <meshStandardMaterial vertexColors roughness={0.4} side={THREE.DoubleSide} />
            </mesh>
            {/* Start/Finish label */}
            <Html position={[positions[0].x + trackNormals[0].x * (TRACK_HALF_W + 2), 2, positions[0].z + trackNormals[0].z * (TRACK_HALF_W + 2)]} center zIndexRange={[50, 0]}>
                <div style={{
                    background: 'rgba(0,0,0,0.8)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: '10px',
                    fontFamily: 'Inter, sans-serif',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    letterSpacing: '1px',
                }}>
                    🏁 START / FINISH
                </div>
            </Html>

            {/* Sector bars */}
            {sectorBars.map((sec, i) => (
                <React.Fragment key={`sector-${i}`}>
                    <mesh geometry={sec.geom}>
                        <meshStandardMaterial
                            color={sec.color}
                            emissive={sec.color}
                            emissiveIntensity={0.4}
                            roughness={0.4}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                    <Html position={[sec.labelPos.x, sec.labelPos.y, sec.labelPos.z]} center zIndexRange={[50, 0]}>
                        <div style={{
                            background: 'rgba(0,0,0,0.7)',
                            border: `1.5px solid ${sec.color}`,
                            padding: '1px 6px',
                            borderRadius: '3px',
                            color: sec.color,
                            fontWeight: '800',
                            fontSize: '9px',
                            fontFamily: 'Inter, sans-serif',
                            pointerEvents: 'none',
                            letterSpacing: '1.5px',
                        }}>
                            {sec.label}
                        </div>
                    </Html>
                </React.Fragment>
            ))}

            {/* DRS Zones — enhanced green overlay with detection/activation lines */}
            {drsZones.map((drs, i) => (
                <React.Fragment key={`drs-${i}`}>
                    {/* Green zone overlay */}
                    <mesh geometry={drs.geom}>
                        <meshStandardMaterial
                            color="#00ff44"
                            transparent
                            opacity={0.25}
                            emissive="#00ff44"
                            emissiveIntensity={0.3}
                            side={THREE.DoubleSide}
                        />
                    </mesh>

                    {/* Detection line (zone start) — yellow bar */}
                    <mesh geometry={drs.detectionLineGeom}>
                        <meshStandardMaterial
                            color="#FFD700"
                            emissive="#FFD700"
                            emissiveIntensity={0.6}
                            side={THREE.DoubleSide}
                        />
                    </mesh>

                    {/* Activation line (zone end) — bright green bar */}
                    <mesh geometry={drs.activationLineGeom}>
                        <meshStandardMaterial
                            color="#00ff44"
                            emissive="#00ff44"
                            emissiveIntensity={0.6}
                            side={THREE.DoubleSide}
                        />
                    </mesh>

                    {/* DRS label with zone number */}
                    <Html position={[drs.labelPos.x, drs.labelPos.y, drs.labelPos.z]} center zIndexRange={[50, 0]}>
                        <div style={{
                            background: 'rgba(0,30,0,0.85)',
                            border: '1.5px solid #00ff44',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            color: '#00ff44',
                            fontWeight: '800',
                            fontSize: '10px',
                            fontFamily: 'Inter, sans-serif',
                            pointerEvents: 'none',
                            letterSpacing: '1.5px',
                            textShadow: '0 0 6px #00ff44',
                        }}>
                            DRS {drs.zoneNumber}
                        </div>
                    </Html>
                </React.Fragment>
            ))}

        </group>
    );
}




function Ground() {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} receiveShadow>
            <planeGeometry args={[500, 500]} />
            <meshStandardMaterial color="#080808" />
        </mesh>
    );
}

/** Animated Driver — positions car ON the track surface */
function DriverAvatar({ globalElapsed, code, drv, isHero, timeline, curve }) {
    const groupRef = useRef();
    const lookTarget = useMemo(() => new THREE.Vector3(), []);
    const currentPos = useMemo(() => new THREE.Vector3(), []);

    useFrame(() => {
        if (!groupRef.current || !timeline || !curve) return;

        const fraction = getTrackFraction(globalElapsed, timeline.cumulativeTimes);
        const t = ((fraction % 1) + 1) % 1;

        // Position on curve — Y=0 to match the track surface
        curve.getPointAt(t, currentPos);
        currentPos.y = 0.01; // just on top of asphalt

        // Look-at slightly ahead
        const tAhead = (t + 0.002) % 1;
        curve.getPointAt(tAhead, lookTarget);
        lookTarget.y = 0.01;

        groupRef.current.position.copy(currentPos);
        groupRef.current.lookAt(lookTarget);
    });

    const finished = globalElapsed >= timeline?.totalTime;

    const livery = TEAM_LIVERIES[drv.team];
    const bodyColor = livery?.body || drv.color;
    const accentColor = livery?.accent || drv.color;
    const secondaryColor = livery?.secondary || bodyColor;
    const carbonColor = livery?.carbon || '#1a1a1a';

    return (
        <group ref={groupRef}>
            {/* GLB F1 Car Model */}
            <group scale={50}>
                <F1CarGLB
                    teamColor={bodyColor}
                    accentColor={accentColor}
                    secondaryColor={secondaryColor}
                    carbonColor={carbonColor}
                    finished={finished}
                />
            </group>

            {/* Hero glow */}
            {isHero && (
                <pointLight distance={12} intensity={4} color={accentColor} position={[0, 1.5, 0]} />
            )}

            {/* Driver label */}
            <Html position={[0, 1.8, 0]} center zIndexRange={[100, 0]}>
                <div style={{
                    background: isHero ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)',
                    border: isHero ? `1.5px solid ${accentColor}` : '1px solid rgba(255,255,255,0.15)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: '#fff',
                    fontWeight: isHero ? '800' : '600',
                    fontSize: isHero ? '11px' : '9px',
                    fontFamily: 'Inter, sans-serif',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    opacity: finished ? 0.3 : 1,
                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                }}>
                    {drv.number ? `#${drv.number} ` : ''}{code}
                </div>
            </Html>
        </group>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function RaceSimulation3D({ simulation, compounds, stints, totalLaps }) {
    if (!simulation || !simulation.trackMap || simulation.trackMap.length < 10) return null;

    const { trackMap, drivers } = simulation;
    const driverCodes = Object.keys(drivers);

    const [selectedDriver, setSelectedDriver] = useState(driverCodes[0] || '');
    const [playing, setPlaying] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [speedIdx, setSpeedIdx] = useState(2);
    const animRef = useRef(null);
    const lastFrameRef = useRef(null);

    const trackCurve = useMemo(() => normaliseTrack3D(trackMap, 100), [trackMap]);

    const timelines = useMemo(() => {
        const tl = {};
        for (const [code, drv] of Object.entries(drivers)) {
            tl[code] = buildTimeline(drv.actualLaps);
        }
        return tl;
    }, [drivers]);

    const customTimeline = useMemo(() => {
        if (!selectedDriver || !stints || stints.length === 0) return null;
        const laps = [];
        for (const stint of stints) {
            const comp = compounds[stint.compound];
            if (!comp) continue;
            for (let t = 0; t < stint.laps; t++) {
                const idx = Math.min(t, comp.curve.length - 1);
                laps.push({ time: comp.curve[idx].predicted, compound: stint.compound });
            }
        }
        if (laps.length === 0) return null;
        return buildTimeline(laps);
    }, [selectedDriver, stints, compounds]);

    const maxTime = useMemo(() => {
        let max = 0;
        for (const tl of Object.values(timelines)) {
            if (tl.totalTime > max) max = tl.totalTime;
        }
        if (customTimeline && customTimeline.totalTime > max) max = customTimeline.totalTime;
        return max;
    }, [timelines, customTimeline]);

    useEffect(() => {
        if (!playing) {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            lastFrameRef.current = null;
            return;
        }
        function tick(timestamp) {
            if (!lastFrameRef.current) lastFrameRef.current = timestamp;
            const dt = (timestamp - lastFrameRef.current) / 1000;
            lastFrameRef.current = timestamp;
            setElapsed(prev => {
                const next = prev + dt * SPEED_MULTIPLIER[speedIdx];
                if (next >= maxTime) { setPlaying(false); return maxTime; }
                return next;
            });
            animRef.current = requestAnimationFrame(tick);
        }
        animRef.current = requestAnimationFrame(tick);
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, [playing, speedIdx, maxTime]);

    useEffect(() => { setElapsed(0); setPlaying(false); }, [selectedDriver]);

    const handlePlayPause = () => {
        if (elapsed >= maxTime) setElapsed(0);
        setPlaying(p => !p);
    };
    const handleSlider = (e) => { setElapsed(parseFloat(e.target.value)); setPlaying(false); };
    const cycleSpeed = () => setSpeedIdx(i => (i + 1) % SPEED_MULTIPLIER.length);

    const heroTl = customTimeline || timelines[selectedDriver];
    const heroLap = heroTl ? getLapNumber(elapsed, heroTl.cumulativeTimes) : 0;

    return (
        <div className="race-sim fade-in stagger-4">
            <div className="section-header fade-in">
                <div className="accent-line" />
                <h2>3D Race Simulation</h2>
            </div>

            <p className="race-sim__intro">
                Select a driver to apply your custom strategy. All other drivers use their actual race lap times.
                Drag to rotate, scroll to zoom.
            </p>

            <div className="race-sim__controls">
                <div className="race-sim__control-group">
                    <label className="race-sim__label">DRIVER</label>
                    <select className="race-sim__select" value={selectedDriver}
                        onChange={e => setSelectedDriver(e.target.value)}>
                        {driverCodes.map(code => (
                            <option key={code} value={code}>
                                #{drivers[code].number || '?'} {code} — {drivers[code].team}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="race-sim__control-group">
                    <button className="race-sim__play-btn" onClick={handlePlayPause}>
                        {playing ? '⏸' : '▶'}
                    </button>
                    <button className="race-sim__speed-btn" onClick={cycleSpeed}>
                        {SPEED_MULTIPLIER[speedIdx]}×
                    </button>
                </div>
                <div className="race-sim__control-group race-sim__control-group--info">
                    <span className="race-sim__stat">
                        <span className="race-sim__stat-label">LAP</span>
                        <span className="race-sim__stat-value">{heroLap} / {totalLaps}</span>
                    </span>
                    <span className="race-sim__stat">
                        <span className="race-sim__stat-label">TIME</span>
                        <span className="race-sim__stat-value">{formatTime(elapsed)}</span>
                    </span>
                </div>
            </div>

            <div className="race-sim__scrubber">
                <input type="range" className="race-sim__slider" min={0} max={maxTime}
                    step={0.5} value={elapsed} onChange={handleSlider} />
                <div className="race-sim__scrubber-labels">
                    <span>0:00</span><span>{formatTime(maxTime)}</span>
                </div>
            </div>

            <div className="race-sim__track-container" style={{ height: '550px', padding: 0, overflow: 'hidden' }}>
                <Canvas camera={{ position: [0, 70, 70], fov: 50 }} shadows>
                    <color attach="background" args={['#050505']} />
                    <ambientLight intensity={1.0} />
                    <directionalLight position={[80, 120, 50]} intensity={1.8} castShadow />
                    <directionalLight position={[-60, 80, -40]} intensity={0.6} />
                    <hemisphereLight args={['#222', '#000', 0.4]} />

                    <OrbitControls makeDefault
                        maxPolarAngle={Math.PI / 2 - 0.05}
                        minDistance={10} maxDistance={180}
                        enableDamping dampingFactor={0.08} />

                    <Ground />
                    {trackCurve && <Track curve={trackCurve} />}

                    {trackCurve && driverCodes.map(code => {
                        const drv = drivers[code];
                        const isHero = code === selectedDriver;
                        const tl = isHero && customTimeline ? customTimeline : timelines[code];
                        if (!tl) return null;
                        return (
                            <DriverAvatar key={code} code={code} drv={drv}
                                isHero={isHero} timeline={tl}
                                curve={trackCurve} globalElapsed={elapsed} />
                        );
                    })}
                </Canvas>
            </div>
        </div>
    );
}
