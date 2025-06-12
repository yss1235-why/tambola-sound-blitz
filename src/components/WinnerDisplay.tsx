// src/components/WinnerDisplay.tsx - Cleaned up version
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Prize } from './TambolaGame';

interface WinnerDisplayProps {
  prizes: Prize[];
}

export const WinnerDisplay: React.FC<WinnerDisplayProps> = ({ prizes }) => {
  const exportWinners = () => {
    const winnerText = prizes.map(prize => 
      `${prize.name}: ${prize.winner?.name || 'Unknown'} (Ticket #${prize.winner?.ticketId || 'Unknown'})`
    ).join('\n');
    
    // Create a simple text export
    const blob = new Blob([`Tambola Game Winners\n\n${winnerText}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tambola-winners-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="tambola-card border-4 border-yellow-400 bg-gradient-to-br from-yellow-50 to-orange-50">
      <CardHeader className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-center">
        <CardTitle className="text-3xl font-bold">🎉 Game Over! 🎉</CardTitle>
        <p className="text-yellow-100">Congratulations to all our winners!</p>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        {prizes.length > 0 ? (
          <>
            <div className="space-y-3">
              {prizes.map((prize, index) => (
                <div
                  key={prize.id}
                  className="p-4 bg-white rounded-lg border-2 border-yellow-300 shadow-md animate-bounce-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">{prize.name}</h3>
                      <p className="text-gray-600">{prize.pattern}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">
                        {prize.winner?.name || 'Unknown Winner'}
                      </p>
                      <p className="text-sm text-gray-600">
                        Ticket #{prize.winner?.ticketId || 'Unknown'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center pt-4">
              <Button
                onClick={exportWinners}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold px-8 py-3 rounded-lg shadow-lg transform transition-transform hover:scale-105"
              >
                📄 Export Winners List
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-xl text-gray-600">No prizes were won in this game!</p>
            <p className="text-gray-500">Start a new game to try again.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
