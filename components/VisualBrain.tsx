"use client";

import React, { useRef, useMemo, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

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

function BrainSculpture({ activeNodes, isThinking }: { activeNodes: number[], isThinking: boolean }) {
  const { scene } = useGLTF("/Brain_Model.glb");
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [targetIndex, setTargetIndex] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  
  const currentFocusPos = useRef(new THREE.Vector3());
  const corridorPulse = useRef(0);
  const corridorTrail = useRef(0);
  const targetColor = useRef(new THREE.Color("#ffffff"));

  const data = useMemo(() => {
    if (!scene) return null;
    const positions: number[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh && child.geometry?.attributes.position) {
        const posAttr = child.geometry.attributes.position;
        child.updateMatrixWorld();
        const matrix = child.matrixWorld;
        const v = new THREE.Vector3();
        const stride = posAttr.count > 40000 ? 3 : 2; 
        for (let i = 0; i < posAttr.count; i += stride) {
          v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
          positions.push(v.x, v.y, v.z);
        }
      }
    });

    const fusedGeo = new THREE.BufferGeometry();
    fusedGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    fusedGeo.center();
    fusedGeo.computeBoundingSphere();
    const s = 1 / (fusedGeo.boundingSphere?.radius || 1);
    fusedGeo.scale(s, s, s);

    const count = fusedGeo.attributes.position.count;
    const randoms = new Float32Array(count).map(() => Math.random());
    fusedGeo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

    const spots = CONCEPTS.map(c => {
      let closestIdx = 0, maxDot = -Infinity;
      const targetDir = new THREE.Vector3(...c.dir).normalize();
      const v = new THREE.Vector3();
      for (let i = 0; i < count; i += 10) {
        v.fromBufferAttribute(fusedGeo.attributes.position as any, i);
        const dot = v.normalize().dot(targetDir);
        if (dot > maxDot) { maxDot = dot; closestIdx = i; }
      }
      return { ...c, pos: new THREE.Vector3().fromBufferAttribute(fusedGeo.attributes.position as any, closestIdx) };
    });

    // Área de Broca fija (Lenguaje)
    const langPos = new THREE.Vector3(-0.4, 0.1, 0.6);

    return { fusedGeometry: fusedGeo, hotspots: spots, languageNode: langPos };
  }, [scene]);

  // ESCUCHA ACTIVA DE NODOS
  useEffect(() => {
    if (activeNodes && activeNodes.length > 0) {
      const idx = activeNodes[0];
      if (idx >= 0 && idx < CONCEPTS.length) {
        setTargetIndex(idx);
        targetColor.current.set(CONCEPTS[idx].color);
        setIsFlashing(true);
        const t = setTimeout(() => setIsFlashing(false), 6000);
        return () => clearTimeout(t);
      }
    }
  }, [activeNodes]);

  useFrame((state) => {
    if (!materialRef.current || !data) return;
    const u = materialRef.current.uniforms;
    const focusSpot = data.hotspots[targetIndex];

    currentFocusPos.current.lerp(focusSpot.pos, 0.06);
    corridorPulse.current = THREE.MathUtils.lerp(corridorPulse.current, isThinking ? 1.0 : 0.0, 0.08);
    corridorTrail.current = THREE.MathUtils.lerp(corridorTrail.current, isFlashing ? 1.0 : 0.05, 0.04);

    u.uTime.value = state.clock.getElapsedTime();
    u.uFocusPoint.value.copy(currentFocusPos.current);
    u.uLanguagePoint.value.copy(data.languageNode);
    u.uCorridorPulse.value = corridorPulse.current;
    u.uCorridorTrail.value = corridorTrail.current;
    u.uColorFocus.value.lerp(targetColor.current, 0.05);
  });

  if (!data) return null;

  return (
    <group scale={3.2}>
      <points geometry={data.fusedGeometry}>
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
            uFocusPoint: { value: new THREE.Vector3() },
            uLanguagePoint: { value: new THREE.Vector3() },
            uCorridorPulse: { value: 0 },
            uCorridorTrail: { value: 0 },
            uColorFocus: { value: new THREE.Color("#ffffff") },
            uColorLanguage: { value: new THREE.Color("#4fe9ff") },
            uColorBase: { value: new THREE.Color("#0d0f14") },
          }}
          vertexShader={`
            uniform float uTime;
            uniform vec3 uFocusPoint;
            uniform vec3 uLanguagePoint;
            uniform float uCorridorPulse;
            uniform float uCorridorTrail;
            attribute float aRandom;
            varying float vInfluence;
            varying float vLang;

            float sdSegment(vec3 p, vec3 a, vec3 b) {
              vec3 pa = p - a, ba = b - a;
              float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
              return length(pa - ba * h);
            }

            void main() {
              vec3 pos = position;
              // Animación de respiración
              float breathe = sin(uTime * 1.2 + aRandom * 10.0) * 0.003;
              pos += normalize(position) * breathe * (1.0 + uCorridorPulse * 2.0);
              
              float focus = smoothstep(0.45, 0.0, distance(pos, uFocusPoint)) * uCorridorTrail;
              float lang = smoothstep(0.55, 0.0, distance(pos, uLanguagePoint));
              
              // Rayo de pensamiento
              float corridor = smoothstep(0.18, 0.0, sdSegment(pos, uLanguagePoint, uFocusPoint));
              float pulse = corridor * (0.3 + 0.7 * sin(uTime * 10.0 - distance(pos, uLanguagePoint) * 5.0)) * uCorridorPulse;
              
              vInfluence = clamp(focus + pulse + (corridor * uCorridorTrail * 0.4), 0.0, 1.0);
              vLang = lang;

              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              gl_PointSize = (1.5 + vLang * 1.2 + vInfluence * 8.0) * (26.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            uniform vec3 uColorBase; uniform vec3 uColorFocus; uniform vec3 uColorLanguage;
            varying float vInfluence; varying float vLang;
            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              vec3 color = mix(uColorBase, uColorLanguage, vLang * 0.35);
              color = mix(color, uColorFocus, vInfluence);
              float alpha = (0.18 + vLang * 0.25 + vInfluence * 0.8) * (1.0 - smoothstep(0.0, 0.5, d));
              gl_FragColor = vec4(color, alpha);
            }
          `}
        />
      </points>

      {data.hotspots.map((spot, i) => {
        const isSelected = i === targetIndex && isFlashing;
        return (
          <group key={i} position={spot.pos}>
            <Html distanceFactor={10} center>
              <div style={{ 
                color: spot.color, fontSize: "10px", letterSpacing: "5px", 
                opacity: isSelected ? 1 : 0.15,
                background: "transparent", // ELIMINA LA CAJA NEGRA
                padding: "0", margin: "0", border: "none",
                transition: "all 0.6s ease", pointerEvents: "none", fontStyle: "italic",
                whiteSpace: "nowrap", textShadow: "0 0 10px rgba(0,0,0,1)"
              }}>{spot.label}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

export default function VisualBrain({ activeNodes, isThinking }: any) {
  return (
    <div style={{ width: "100%", height: "100vh", background: "#060709", position: "relative" }}>
      {/* CAPA CSS: Ruido y Viñeta */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.8) 100%)'
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        opacity: 0.04, mixBlendMode: 'overlay'
      }} />

      <Canvas camera={{ position: [0, 0, 7.5], fov: 32 }} gl={{ antialias: true, alpha: false }}>
        <Suspense fallback={null}>
          <BrainSculpture activeNodes={activeNodes} isThinking={isThinking} />
        </Suspense>
        <OrbitControls enableZoom={false} enablePan={false} dampingFactor={0.05} autoRotate autoRotateSpeed={0.3} />
      </Canvas>
    </div>
  );
}
