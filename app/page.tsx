'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Chat from '@/components/ui/chat';

// Cargamos el cerebro de forma dinámica para que NO se ejecute en el servidor
const VisualBrain = dynamic(() => import('@/components/VisualBrain'), { 
  ssr: false,
  loading: () => <div className="flex-1 bg-black" /> // Pantalla negra mientras carga
});

export default function Home() {
  const [activeNodes, setActiveNodes] = useState<number[]>([0, 0]);
  const [isThinking, setIsThinking] = useState(false);

  const handleNewResponse = (nodes: number[]) => {
    setActiveNodes(nodes);
  };

  return (
    <main className="relative h-screen w-screen bg-black overflow-hidden flex">
      {/* LADO IZQUIERDO: Cerebro 3D (Cargado dinámicamente) */}
      <div className="flex-1 relative">
        <VisualBrain 
          activeNodes={activeNodes} 
          isThinking={isThinking} 
        />
      </div>

      {/* LADO DERECHO: Interfaz de Chat */}
      <div className="w-[400px] h-screen z-10 border-l border-white/10">
        <Chat 
          onNewResponse={handleNewResponse} 
          isThinking={isThinking}
          setIsThinking={setIsThinking}
        />
      </div>
    </main>
  );
}
