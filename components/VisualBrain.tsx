"use client";

import React, { useRef, useMemo, Suspense, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Html, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom, Noise } from "@react-three/postprocessing";
import * as THREE from "three";

// 1. CONCEPTOS EN INGLÉS
const CONCEPTS = [
  { id: 0, label: "PMI", dir: [1, 0.2, 0.5], color: "#8fe9ff" },
  { id: 1, label: "AI", dir: [-0.6, 0.8, 0.4], color: "#d5b36a" }, 
  { id: 2, label: "ENGINEER", dir: [0.4, 0.7, -0.6], color: "#8ea0d8" },
  { id: 3, label: "FLEET", dir: [-0.8, -0.4, 0.5], color: "#95d1b3" },
  { id: 4, label: "MANAGEMENT", dir: [0.7, -0.6, -0.4], color: "#b29bcb" },
  { id: 5, label: "REAL ESTATE", dir: [-0.4, -0.8, -0.5], color: "#c2c2c2" },
  { id: 6, label: "SPORTS", dir: [0.3, 0.1, -0.9], color: "#c98f8f" },
  { id: 7, label: "VAN", dir: [0.1, -0.9, 0.8], color: "#d9c6a2" },
];

function BrainSculpture({ activeNodes, isThinking, onReady }: { activeNodes: number[], isThinking: boolean, onReady: () => void }) {
  const { scene } = useGLTF("/Brain_Model.glb");
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [targetIndex, setTargetIndex] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  
  const currentFocusPoint = useRef(new THREE.Vector3());
  const currentIntensity = useRef(0);
  const currentColor = useRef(new THREE.Color("#555"));

  const data = useMemo(() => {
    if (!scene) return null;
    const positionsArray: number[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh && child.geometry?.attributes.position) {
        const posAttr = child.geometry.attributes.position;
        child.updateMatrixWorld();
        const v = new THREE.Vector3();
        for (let i = 0; i < posAttr.count; i++) {
          v.fromBufferAttribute(posAttr, i);
          v.applyMatrix4(child.matrixWorld);
          positionsArray.push(v.x, v.y, v.z);
        }
      }
    });

    if (positionsArray.length === 0) return null;

    const fusedGeo = new THREE.BufferGeometry();
    fusedGeo.setAttribute("position", new THREE.Float32BufferAttribute(positionsArray, 3));
    fusedGeo.computeBoundingSphere();
    fusedGeo.center();
    const radius = fusedGeo.boundingSphere?.radius || 1;
    fusedGeo.scale(1 / radius, 1 / radius, 1 / radius);

    const count = fusedGeo.attributes.position.count;
    const randoms = new Float32Array(count);
    const radialBias = new Float32Array(count);
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      randoms[i] = Math.random();
      p.fromBufferAttribute(fusedGeo.attributes.position as THREE.BufferAttribute, i);
      radialBias[i] = p.length();
    }
    fusedGeo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));
    fusedGeo.setAttribute("aRadialBias", new THREE.BufferAttribute(radialBias, 1));

    const spots = CONCEPTS.map((concept) => {
      let closestIdx = 0; let maxDot = -Infinity;
      const targetDir = new THREE.Vector3(...concept.dir).normalize();
      const v = new THREE.Vector3();
      for (let i = 0; i < fusedGeo.attributes.position.count; i += 10) {
        v.fromBufferAttribute(fusedGeo.attributes.position as THREE.BufferAttribute, i);
        const dot = v.normalize().dot(targetDir);
        if (dot > maxDot) { maxDot = dot; closestIdx = i; }
      }
      return { ...concept, pos: new THREE.Vector3().fromBufferAttribute(fusedGeo.attributes.position as THREE.BufferAttribute, closestIdx) };
    });

    // Centro del lenguaje (Broca)
    const langDir = new THREE.Vector3(-0.8, 0.2, 0.5).normalize();
    let langIdx = 0; let langMaxDot = -Infinity;
    const vL = new THREE.Vector3();
    for (let i = 0; i < fusedGeo.attributes.position.count; i += 15) {
      vL.fromBufferAttribute(fusedGeo.attributes.position as THREE.BufferAttribute, i);
      const dot = vL.normalize().dot(langDir);
      if (dot > langMaxDot) { langMaxDot = dot; langIdx = i; }
    }
    const langPos = new THREE.Vector3().fromBufferAttribute(fusedGeo.attributes.position as THREE.BufferAttribute, langIdx);

    return { fusedGeometry: fusedGeo, hotspots: spots, languageNode: langPos };
  }, [scene]);

  // Avisar que el modelo está listo para activar el post-procesado
  useEffect(() => { if (data) onReady(); }, [data, onReady]);

  useEffect(() => {
    if (activeNodes?.length > 0 && data?.hotspots.length > 0) {
      const idx = activeNodes[0];
      if (idx < data.hotspots.length) {
        setTargetIndex(idx);
        setIsFlashing(true);
        const t = setTimeout(() => setIsFlashing(false), 5000);
        return () => clearTimeout(t);
      }
    }
  }, [activeNodes, data]);

  useFrame((state) => {
    if (!materialRef.current || !data) return;
    const focusSpot = data.hotspots[targetIndex];
    if (!focusSpot) return;

    currentFocusPoint.current.lerp(focusSpot.pos, 0.05);
    currentIntensity.current = THREE.MathUtils.lerp(currentIntensity.current, isFlashing ? 1.0 : 0.0, 0.08);
    currentColor.current.lerp(new THREE.Color(focusSpot.color), 0.05);
    
    const u = materialRef.current.uniforms;
    u.uTime.value = state.clock.getElapsedTime();
    u.uFocusPoint.value.copy(currentFocusPoint.current);
    u.uFocusIntensity.value = currentIntensity.current;
    u.uColorFocus.value.copy(currentColor.current);
    u.uLanguagePoint.value.copy(data.languageNode);
    u.uThinkingPulse.value = THREE.MathUtils.lerp(u.uThinkingPulse.value, isThinking ? 1.0 : 0.0, 0.1);
  });

  if (!data) return null;

  return (
    <group scale={2.8}>
      <points geometry={data.fusedGeometry}>
        <shaderMaterial
          ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 }, uFocusPoint: { value: new THREE.Vector3() }, uFocusIntensity: { value: 0 },
            uColorFocus: { value: new THREE.Color("#ffffff") }, uLanguagePoint: { value: new THREE.Vector3() },
            uColorLanguage: { value: new THREE.Color("#5e81ac") }, uThinkingPulse: { value: 0 },
            uColorBase: { value: new THREE.Color("#111318") },
          }}
          vertexShader={`
            uniform float uTime; uniform vec3 uFocusPoint; uniform float uFocusIntensity; 
            uniform vec3 uLanguagePoint; uniform float uThinkingPulse;
            attribute float aRandom; attribute float aRadialBias;
            varying float vFocus; varying float vLang;
            void main() {
              vec3 pos = position;
              float edge = smoothstep(0.35, 1.0, aRadialBias);
              pos += vec3(sin(uTime * 0.9 + pos.y * 8.0 + aRandom * 6.28), cos(uTime * 0.8 + pos.z * 7.0 + aRandom * 7.28), sin(uTime * 1.0 + pos.x * 9.0 + aRandom * 8.28)) * 0.0035 * mix(0.35, 1.0, edge);
              float focus = smoothstep(0.85, 0.0, distance(pos, uFocusPoint)) * uFocusIntensity;
              float lang = smoothstep(0.65, 0.0, distance(pos, uLanguagePoint)); 
              vFocus = clamp(focus, 0.0, 1.0); vLang = clamp(lang, 0.0, 1.0);
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              float heartbeat = 1.0 + (sin(uTime * 5.0) * 0.35 * uThinkingPulse);
              gl_PointSize = (1.5 + vLang * 1.8 + vFocus * 8.5) * heartbeat * (24.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            uniform vec3 uColorBase; uniform vec3 uColorFocus; uniform vec3 uColorLanguage;
            varying float vFocus; varying float vLang;
            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              float soft = 1.0 - smoothstep(0.0, 0.5, d);
              float core = 1.0 - smoothstep(0.0, 0.16, d);
              vec3 color = mix(mix(uColorBase, uColorLanguage, vLang * 0.6), uColorFocus, vFocus);
              float alpha = (0.12 + vLang * 0.35 + vFocus * 0.95) * soft;
              gl_FragColor = vec4(color + core * (vFocus * 0.5), alpha);
            }
          `}
        />
      </points>

      {data.hotspots.map((spot, i) => (
        <group key={i} position={spot.pos}>
          <Html distanceFactor={8} position={[0.14, 0, 0]} center>
            <div style={{ 
              color: spot.color, fontSize: "9px", letterSpacing: "5px", textTransform: "uppercase", 
              fontFamily: 'serif', fontStyle: "italic", whiteSpace: "nowrap", 
              opacity: isFlashing && i === targetIndex ? 0.9 : 0.12,
              transform: isFlashing && i === targetIndex ? "translate(14px, -50%)" : "translate(0px, -50%)", 
              transition: "all 1s ease", textShadow: "0 0 18px rgba(0,0,0,0.75)", pointerEvents: "none" 
            }}>
              {spot.label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

export default function VisualBrain({ activeNodes, isThinking }: { activeNodes: number[], isThinking: boolean }) {
  const [isReady, setIsReady] = useState(false);

  return (
    <div style={{ width: "100%", height: "100vh", background: "#060708", position: "relative" }}>
      <Canvas 
        camera={{ position: [0, 0, 8.5], fov: 28 }}
        gl={{ antialias: false, alpha: false, preserveDrawingBuffer: true }} 
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <BrainSculpture 
            activeNodes={activeNodes} 
            isThinking={isThinking} 
            onReady={() => setIsReady(true)} 
          />
          
          {/* CRÍTICO: Solo se activa si el modelo ha confirmado que existe */}
          {isReady && (
            <EffectComposer disableNormalPass multisampling={0}> 
              <Bloom luminanceThreshold={0.15} mipmapBlur intensity={1.8} radius={0.5} />
              <Noise opacity={0.07} />
            </EffectComposer>
          )}
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.05} minDistance={4} maxDistance={15} />
      </Canvas>
    </div>
  );
}
