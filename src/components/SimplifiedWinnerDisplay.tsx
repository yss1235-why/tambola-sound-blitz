// FILE 2: src/components/SimplifiedWinnerDisplay.tsx - NEW MOBILE-OPTIMIZED COMPONENT
// CREATE this new file
// ================================================================================

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, User, Phone, Play, CheckCircle, Calendar } from 'lucide-react';
import { GameData } from '@/services/firebase';

interface SimplifiedWinnerDisplayProps {
  gameData: GameData;
  onCreateNewGame?: () => void;
}

export const SimplifiedWinnerDisplay: React.FC<SimplifiedWinnerDisplayProps> = ({ 
  gameData, 
  onCreateNewGame 
}) => {
  const wonPrizes = Object.values(gameData.prizes).filter(p => p.won);
  const totalWinners = wonPrizes.reduce((total, prize) => total + (prize.winners?.length || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 p-2 sm:p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        
        {/* Celebration Header - Compact */}
        <Card className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0">
          <CardContent className="text-center py-4 sm:py-6">
            <Trophy className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-4 animate-bounce" />
            <h1 className="text-xl sm:text-3xl font-bold mb-1 sm:mb-2">🎉 Game Complete! 🎉</h1>
            <p className="text-sm sm:text-lg opacity-90">
              {totalWinners} winner{totalWinners !== 1 ? 's' : ''} • {gameData.gameState.calledNumbers?.length || 0} numbers called
            </p>
            <p className="text-xs sm:text-sm opacity-75 mt-1">
              {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString(undefined, { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </p>
          </CardContent>
        </Card>

        {/* Prize Winners - Ultra Compact Mobile Layout */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center justify-between text-base sm:text-lg">
              <div className="flex items-center">
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Winners & Contact Info
              </div>
              <Badge className="bg-green-600 text-white text-xs">
                {wonPrizes.length} prize{wonPrizes.length !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {wonPrizes.length === 0 ? (
              <div className="text-center py-6">
                <Trophy className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 text-sm">No prizes were won in this game.</p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {wonPrizes
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((prize) => (
                  <Card key={prize.id} className="bg-green-50 border-green-200">
                    <CardContent className="p-2 sm:p-3">
                      {/* Prize Header - Single Line */}
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm sm:text-base font-bold text-green-800 flex items-center">
                          🏆 {prize.name}
                          {prize.winningNumber && (
                            <Badge variant="outline" className="ml-2 text-xs border-green-400 text-green-700 hidden sm:inline-flex">
                              #{prize.winningNumber}
                            </Badge>
                          )}
                        </h3>
                        <Badge className="bg-green-600 text-white text-xs">
                          {prize.winners?.length || 0}
                        </Badge>
                      </div>

                      {/* Winners Grid - Mobile Optimized */}
                      {prize.winners && prize.winners.length > 0 && (
                        <div className="space-y-1">
                          {prize.winners.map((winner, idx) => (
                            <div key={idx} className="bg-white rounded p-2 border border-green-200">
                              <div className="flex items-center justify-between">
                                {/* Winner Info - Compact */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center space-x-1">
                                    <User className="w-3 h-3 text-gray-600 flex-shrink-0" />
                                    <span className="font-medium text-gray-800 text-xs sm:text-sm truncate">
                                      {winner.name}
                                    </span>
                                    <Badge variant="outline" className="text-xs border-gray-300 text-gray-600">
                                      T{winner.ticketId}
                                    </Badge>
                                  </div>
                                  {winner.phone && (
                                    <div className="flex items-center space-x-1 mt-1">
                                      <Phone className="w-3 h-3 text-green-600 flex-shrink-0" />
                                      <a 
                                        href={`tel:${winner.phone}`}
                                        className="text-xs text-green-700 hover:text-green-800 font-medium"
                                      >
                                        {winner.phone}
                                      </a>
                                    </div>
                                  )}
                                </div>
                                
                                {/* WhatsApp Quick Action */}
                                {winner.phone && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const message = `Congratulations ${winner.name}! You won ${prize.name} in today's Tambola game with ticket ${winner.ticketId}. Well done! 🎉`;
                                      window.open(`https://wa.me/${winner.phone}?text=${encodeURIComponent(message)}`, '_blank');
                                    }}
                                    className="text-green-600 border-green-300 hover:bg-green-50 text-xs px-2 py-1 h-7"
                                  >
                                    📱 WhatsApp
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create New Game Button - Prominent */}
        {onCreateNewGame && (
          <Card>
            <CardContent className="p-3 sm:p-4 text-center">
              <div className="mb-3 p-2 sm:p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs sm:text-sm text-blue-800 font-medium mb-1">
                  ✅ Game completed! Winner information saved.
                </p>
                <p className="text-xs text-blue-600">
                  💡 Take screenshots or note down contact details before creating a new game.
                </p>
              </div>
              
              <Button 
                onClick={onCreateNewGame}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 text-sm sm:text-base font-semibold w-full sm:w-auto"
                size="lg"
              >
                <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Create New Game
              </Button>
              
              <p className="text-xs text-gray-500 mt-2">
                🔒 Winner data remains in system records
              </p>
            </CardContent>
          </Card>
        )}

        {/* Game Summary - Minimal */}
        <Card className="bg-gray-50">
          <CardContent className="p-3 text-center">
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
              <div>
                <span className="font-medium">{gameData.gameState.calledNumbers?.length || 0}</span>
                <div>Numbers</div>
              </div>
              <div>
                <span className="font-medium">{Object.values(gameData.tickets || {}).filter(t => t.isBooked).length}</span>
                <div>Players</div>
              </div>
              <div>
                <span className="font-medium">{wonPrizes.length}/{Object.keys(gameData.prizes).length}</span>
                <div>Prizes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
