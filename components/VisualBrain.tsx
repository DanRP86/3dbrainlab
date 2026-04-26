"use client";

import React, { useRef, useMemo, Suspense, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Html, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom, Noise } from "@react-three/postprocessing";
import * as THREE from "three";

// 1. INGLÉS Y CONCEPTOS
const CONCEPTS = [
  { id: 0, label: "PMI", dir: [1, 0.2, 0.5], color: "#8fe9ff" },
  { id: 1, label: "AI", dir: [-0.6, 0.8, 0.4], color: "#d5b36a" }, // IA -> AI
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
  
  const currentFocusPoint = useRef(new THREE.Vector3());
  const currentIntensity = useRef(0);
  const currentColor = useRef(new THREE.Color("#555"));

  const { fusedGeometry, hotspots, languageNode } = useMemo(() => {
    if (!scene) return { fusedGeometry: null, hotspots: [], languageNode: new THREE.Vector3() };

    const positionsArray: number[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh && child.geometry && child.geometry.attributes.position) {
        const posAttr = child.geometry.attributes.position;
        child.updateMatrixWorld();
        const matrix = child.matrixWorld;
        const v = new THREE.Vector3();
        for (let i = 0; i < posAttr.count; i++) {
          v.fromBufferAttribute(posAttr, i);
          v.applyMatrix4(matrix);
          positionsArray.push(v.x, v.y, v.z);
        }
      }
    });

    if (positionsArray.length === 0) return { fusedGeometry: null, hotspots: [], languageNode: new THREE.Vector3() };

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

    const positions = fusedGeo.attributes.position;
    const spots = CONCEPTS.map((concept) => {
      let closestIdx = 0; let maxDot = -Infinity;
      const targetDir = new THREE.Vector3(...concept.dir).normalize();
      const v = new THREE.Vector3();
      for (let i = 0; i < positions.count; i += 10) {
        v.fromBufferAttribute(positions as THREE.BufferAttribute, i);
        const dot = v.normalize().dot(targetDir);
        if (dot > maxDot) { maxDot = dot; closestIdx = i; }
      }
      return { ...concept, pos: new THREE.Vector3().fromBufferAttribute(positions as THREE.BufferAttribute, closestIdx) };
    });

    // 2. CENTRO DEL LENGUAJE (Simulamos el Área de Broca en el hemisferio frontal izquierdo)
    let langIdx = 0; let langMaxDot = -Infinity;
    const langDir = new THREE.Vector3(-0.8, 0.2, 0.5).normalize();
    const vLang = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 10) {
      vLang.fromBufferAttribute(positions as THREE.BufferAttribute, i);
      const dot = vLang.normalize().dot(langDir);
      if (dot > langMaxDot) { langMaxDot = dot; langIdx = i; }
    }
    const langPos = new THREE.Vector3().fromBufferAttribute(positions as THREE.BufferAttribute, langIdx);
    
    return { fusedGeometry: fusedGeo, hotspots: spots, languageNode: langPos };
  }, [scene]);

  // REACCIÓN AL CHAT
  useEffect(() => {
    if (activeNodes && activeNodes.length > 0 && hotspots.length > 0) {
      const primaryTarget = activeNodes[0];
      if (primaryTarget < hotspots.length) {
        setTargetIndex(primaryTarget);
        setIsFlashing(true); // Encendemos el brillo intenso
        
        // Se apaga tras 5 segundos, volviendo al estado base
        const timer = setTimeout(() => {
          setIsFlashing(false);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [activeNodes, hotspots]);

  useFrame((state) => {
    if (!materialRef.current || !hotspots || hotspots.length === 0) return;
    
    const focusSpot = hotspots[targetIndex];
    if (!focusSpot) return;

    // Lógicas de intensidad
    const desiredIntensity = isFlashing ? 1.0 : 0.0;
    currentFocusPoint.current.lerp(focusSpot.pos, 0.05);
    currentIntensity.current = THREE.MathUtils.lerp(currentIntensity.current, desiredIntensity, 0.08);
    currentColor.current.lerp(new THREE.Color(focusSpot.color), 0.05);
    
    const uniforms = materialRef.current.uniforms;
    uniforms.uTime.value = state.clock.getElapsedTime();
    uniforms.uFocusPoint.value.copy(currentFocusPoint.current);
    uniforms.uFocusIntensity.value = currentIntensity.current;
    uniforms.uColorFocus.value.copy(currentColor.current);
    
    uniforms.uLanguagePoint.value.copy(languageNode);
    uniforms.uThinkingPulse.value = isThinking ? 1.0 : 0.0;
  });

  if (!fusedGeometry || !hotspots || hotspots.length === 0) return null;

  return (
    <group scale={2.8}>
      <points geometry={fusedGeometry}>
        <shaderMaterial
          ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 }, 
            uFocusPoint: { value: new THREE.Vector3() }, 
            uFocusIntensity: { value: 0 },
            uColorFocus: { value: new THREE.Color("#ffffff") }, 
            
            uLanguagePoint: { value: new THREE.Vector3() },
            uColorLanguage: { value: new THREE.Color("#5e81ac") }, // Color azulado para el lenguaje
            uThinkingPulse: { value: 0 },
            
            uColorBase: { value: new THREE.Color("#111318") }, // Fondo casi negro
          }}
          vertexShader={`
            uniform float uTime; 
            uniform vec3 uFocusPoint; 
            uniform float uFocusIntensity; 
            uniform vec3 uLanguagePoint;
            uniform float uThinkingPulse;
            
            attribute float aRandom; 
            attribute float aRadialBias;
            
            varying float vFocus; 
            varying float vLang;

            void main() {
              vec3 pos = position;
              float edge = smoothstep(0.35, 1.0, aRadialBias);
              
              // Movimiento base de las partículas
              pos += vec3(sin(uTime * 0.9 + pos.y * 8.0 + aRandom * 6.28), cos(uTime * 0.8 + pos.z * 7.0 + aRandom * 7.28), sin(uTime * 1.0 + pos.x * 9.0 + aRandom * 8.28)) * 0.0035 * mix(0.35, 1.0, edge);
              
              float focus = smoothstep(0.85, 0.0, distance(pos, uFocusPoint)) * uFocusIntensity;
              float lang = smoothstep(0.65, 0.0, distance(pos, uLanguagePoint)); // Brillo fijo
              
              vFocus = clamp(focus, 0.0, 1.0);
              vLang = clamp(lang, 0.0, 1.0);
              
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              
              // 3. EL LATIDO (Pulsación general y tamaño)
              float heartbeat = 1.0 + (sin(uTime * 5.0) * 0.3 * uThinkingPulse);
              float size = 1.5 + vLang * 2.0 + vFocus * 8.0;
              
              gl_PointSize = size * heartbeat * (24.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            uniform vec3 uColorBase; 
            uniform vec3 uColorFocus; 
            uniform vec3 uColorLanguage;
            
            varying float vFocus; 
            varying float vLang;

            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              
              float soft = 1.0 - smoothstep(0.0, 0.5, d);
              float core = 1.0 - smoothstep(0.0, 0.16, d);
              
              vec3 color = uColorBase;
              color = mix(color, uColorLanguage, vLang * 0.6);
              color = mix(color, uColorFocus, vFocus);
              
              // El lenguaje siempre tiene un 30% de intensidad base
              float alpha = (0.15 + vLang * 0.3 + vFocus * 0.9) * soft;
              
              gl_FragColor = vec4(color + core * (vFocus * 0.5), alpha);
            }
          `}
        />
      </points>

      {/* Títulos HTML en Inglés */}
      {hotspots.map((spot, i) => {
        const isActive = isFlashing && i === targetIndex;
        return (
          <group key={i} position={spot.pos}>
            <Html distanceFactor={8} position={[0.14, 0, 0]} center>
              <div style={{ 
                color: spot.color, fontSize: "9px", letterSpacing: "5px", textTransform: "uppercase", 
                fontFamily: 'serif', fontStyle: "italic", whiteSpace: "nowrap", 
                opacity: isActive ? 0.9 : 0.15, // Siempre ligeramente visibles
                transform: isActive ? "translate(14px, -50%)" : "translate(0px, -50%)", 
                transition: "all 1.0s ease", textShadow: "0 0 18px rgba(0,0,0,0.75)", pointerEvents: "none" 
              }}>
                {spot.label}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

export default function VisualBrain({ activeNodes, isThinking }: { activeNodes: number[], isThinking: boolean }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 800); // Margen de seguridad para WebGL
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", background: "#060708", position: "relative" }}>
      <Canvas 
        camera={{ position: [0, 0, 8.5], fov: 28 }}
        gl={{ antialias: false, alpha: false, preserveDrawingBuffer: true }} 
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <BrainSculpture activeNodes={activeNodes} isThinking={isThinking} />
          
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
