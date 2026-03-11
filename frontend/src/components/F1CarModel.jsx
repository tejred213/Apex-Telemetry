/*
  F1 Car GLB Model — loads the Red Bull RB21 GLB and dynamically
  recolors materials to match each team's 2024 livery.

  Original model:
    Author: Abu Saif (https://sketchfab.com/abuhossain844)
    License: CC-BY-4.0
    Source: https://sketchfab.com/3d-models/f1-2025-redbull-rb21-418c3b3cdf9d41ea8beb15076d875a86
*/

import React, { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * F1CarGLB – renders the GLB model and dynamically recolors
 * multiple materials to match the driver's team livery.
 *
 * Props:
 *   teamColor     – hex for main body ("paints" material)
 *   accentColor   – hex for highlights ("drivercolor" material)
 *   secondaryColor – hex for secondary zones ("detail" material)
 *   carbonColor   – hex tint for carbon fibre parts
 *   finished      – boolean, dims the car when the driver has finished
 */
export function F1CarGLB({
  teamColor = '#3671C6',
  accentColor,
  secondaryColor,
  carbonColor,
  finished = false,
}) {
  const { scene } = useGLTF('/f1-2025_redbull_rb21.glb');
  const ref = useRef();

  // Clone scene so each car instance is independent
  const clone = useMemo(() => {
    return scene.clone(true);
  }, [scene]);

  // Recolor materials based on team livery
  useEffect(() => {
    if (!clone) return;

    const body    = new THREE.Color(teamColor);
    const accent  = new THREE.Color(accentColor || teamColor);
    const secondary = new THREE.Color(secondaryColor || teamColor);
    const carbon  = new THREE.Color(carbonColor || '#1a1a1a');

    clone.traverse((child) => {
      if (!child.isMesh) return;

      // Clone material per instance (only once)
      if (!child.userData._matCloned) {
        child.material = child.material.clone();
        child.userData._matCloned = true;
      }

      const name = child.material.name;

      // ── Main body paint → team primary color ──
      if (name === 'paints') {
        child.material.color.copy(body);
        if (child.material.emissive) {
          child.material.emissive.copy(body);
          child.material.emissiveIntensity = 0.08;
        }
        child.material.metalness = 0.6;
        child.material.roughness = 0.25;
      }

      // ── Driver color (T-cam, accents) → accent color ──
      if (name === 'drivercolor') {
        child.material.color.copy(accent);
        if (child.material.emissive) {
          child.material.emissive.copy(accent);
          child.material.emissiveIntensity = 0.15;
        }
      }

      // ── Detail parts → secondary color ──
      if (name === 'detail') {
        child.material.color.copy(secondary);
        if (child.material.emissive) {
          child.material.emissive.copy(secondary);
          child.material.emissiveIntensity = 0.04;
        }
      }

      // ── Carbon fibre → team-tinted carbon ──
      if (name === 'carbon' || name === 'carbon.sw') {
        child.material.color.copy(carbon);
        child.material.roughness = 0.35;
        child.material.metalness = 0.4;
      }

      // ── Generics (bargeboards, floor) → darken towards carbon ──
      if (name === 'generics') {
        const genColor = body.clone().lerp(new THREE.Color('#1a1a1a'), 0.7);
        child.material.color.copy(genColor);
      }

      // ── Decals → slight tint towards team color for cohesion ──
      if (name === 'decals2' || name === 'decals') {
        const decalTint = body.clone().lerp(new THREE.Color('#333333'), 0.5);
        child.material.color.copy(decalTint);
      }

      // ── Finished dimming ──
      child.material.transparent = finished;
      child.material.opacity = finished ? 0.35 : 1.0;
    });
  }, [clone, teamColor, accentColor, secondaryColor, carbonColor, finished]);

  return <primitive ref={ref} object={clone} />;
}

useGLTF.preload('/f1-2025_redbull_rb21.glb');
