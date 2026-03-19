import React, { useState } from 'react';
import GameCanvas from './components/GameCanvas';

export default function App() {
  const [view, setView] = useState<'landing' | 'game'>('landing');

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col overflow-hidden font-sans text-slate-100">
      {view === 'landing' && (
        <>
          <header className="w-full max-w-4xl mx-auto p-6 flex justify-center items-center">
            <h1 className="text-4xl md:text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 transform -skew-x-12 mt-10">
              TURBO SPEED
            </h1>
          </header>
          <main className="flex-1 w-full flex flex-col items-center justify-center p-4">
            <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-6 text-center">Start Your Engines</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  <button
                    onClick={() => setView('game')}
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-black font-bold py-4 text-lg rounded-lg shadow-lg transition-transform active:scale-95"
                  >
                    START RACE
                  </button>
                </div>
              </div>
            </div>
          </main>
        </>
      )}

      {view === 'game' && (
        <div className="flex-1 relative w-full h-full">
          <GameCanvas />
        </div>
      )}
    </div>
  );
}
