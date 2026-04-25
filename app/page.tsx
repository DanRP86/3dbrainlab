import React from 'react';
import VisualBrain from '../components/VisualBrain'; // Importamos el cerebro

export default function Home() {
  return (
    <main style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
      
      {/* CAPA 1: El Cerebro 3D (Al fondo) */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
        <VisualBrain />
      </div>

      {/* CAPA 2: La Interfaz (Encima del 3D) */}
      <div style={{ position: 'absolute', top: '40px', left: '40px', color: '#fff', zIndex: 10, pointerEvents: 'none' }}>
        <h1 style={{ fontSize: '1rem', fontWeight: '300', letterSpacing: '4px', opacity: 0.7 }}>
          DANIEL RUBIO | DIGITAL TWIN
        </h1>
        <p style={{ fontSize: '0.7rem', marginTop: '10px', opacity: 0.5 }}>
          ASSET PORTFOLIO & AI
        </p>
      </div>

    </main>
  );
}