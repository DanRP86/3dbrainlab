'use client';

import { useState } from 'react';
import VisualBrain from '@/components/3d/VisualBrain';
import Chat from '@/components/ui/Chat';

export default function Home() {
  const [activeNodes, setActiveNodes] = useState<number[]>([0, 0]);
  const [isThinking, setIsThinking] = useState(false);

  const handleNewResponse = (nodes: number[]) => {
    setActiveNodes(nodes); // Esto disparará la animación en VisualBrain.tsx
  };

  return (
    <main className="relative h-screen w-screen bg-black overflow-hidden flex">
      {/* LADO IZQUIERDO: Cerebro 3D */}
      <div className="flex-1 relative">
        <VisualBrain 
          activeNodes={activeNodes} 
          isThinking={isThinking} 
        />
      </div>

      {/* LADO DERECHO: Interfaz de Chat */}
      <div className="w-[400px] h-screen z-10">
        <Chat 
          onNewResponse={handleNewResponse} 
          isThinking={isThinking}
          setIsThinking={setIsThinking}
        />
      </div>
    </main>
  );
}
