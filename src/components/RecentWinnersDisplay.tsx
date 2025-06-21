// src/components/RecentWinnersDisplay.tsx - ENHANCED: Add clean host celebration mode
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Ticket,
  Users,
  Calendar,
  User,
  Phone,
  Hash,
  CheckCircle,
  AlertCircle,
  Play,
  Star
} from 'lucide-react';
import { useGameData } from '@/providers/GameDataProvider';
import { TambolaTicket } from '@/services/firebase';

interface RecentWinnersDisplayProps {
  hostMode?: boolean; // NEW: Enable clean celebration mode
  onCreateNewGame?: () => void; // NEW: For host control
}

export const RecentWinnersDisplay: React.FC<RecentWinnersDisplayProps> = ({ 
  hostMode = false,
  onCreateNewGame 
}) => {
  const { gameData, isLoading, error } = useGameData();
  const [expandedWinners, setExpandedWinners] = useState<Set<string>>(new Set());
  
  // Auto-expand all winners for better UX
  React.useEffect(() => {
    if (gameData && gameData.gameState.gameOver) {
      const wonPrizes = Object.values(gameData.prizes).filter(p => p.won);
      if (wonPrizes.length > 0) {
        const allWinnerIds = wonPrizes.flatMap(prize =>
          prize.winners?.map((_, idx) => `${prize.id}-${idx}`) || []
        );
        setExpandedWinners(new Set(allWinnerIds));
      }
    }
  }, [gameData]);
  
  // Toggle winner ticket display
  const toggleWinnerTicket = (winnerId: string) => {
    setExpandedWinners(prev => {
      const newSet = new Set(prev);
      if (newSet.has(winnerId)) {
        newSet.delete(winnerId);
      } else {
        newSet.add(winnerId);
      }
      return newSet;
    });
  };
  
  // Calculate game statistics
  const gameStats = useMemo(() => {
    if (!gameData) return null;
    
    const startTime = new Date(gameData.createdAt);
    const endTime = new Date(gameData.lastWinnerAt || gameData.createdAt);
    const durationMs = endTime.getTime() - startTime.getTime();
    
    const minutes = Math.floor(durationMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const duration = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
    
    const totalPlayers = Object.values(gameData.tickets || {}).filter(t => t.isBooked).length;
    const numbersCalledCount = gameData.gameState.calledNumbers?.length || 0;
    
    return {
      duration,
      totalPlayers,
      numbersCalledCount,
      endTime
    };
  }, [gameData]);

  // ✅ SAFETY: Comprehensive ticket rendering with error recovery
  const renderWinningTicket = (ticket: TambolaTicket, calledNumbers: number[]) => {
    if (!ticket || !ticket.rows) {
      return (
        <div className="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
          <div className="text-center py-2">
            <Clock className="w-4 h-4 text-yellow-600 mx-auto mb-1" />
            <p className="text-sm text-yellow-700">Ticket data loading...</p>
          </div>
        </div>
      );
    }

    if (!Array.isArray(ticket.rows) || ticket.rows.length !== 3) {
      return (
        <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
          <div className="text-center py-2">
            <AlertCircle className="w-4 h-4 text-red-600 mx-auto mb-1" />
            <p className="text-sm text-red-700">Invalid ticket structure</p>
          </div>
        </div>
      );
    }

    let allNumbers: number[] = [];
    try {
      allNumbers = ticket.rows.flat();
      if (allNumbers.length !== 27) {
        throw new Error(`Expected 27 cells, got ${allNumbers.length}`);
      }
    } catch (error) {
      return (
        <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
          <div className="text-center py-2">
            <AlertCircle className="w-4 h-4 text-red-600 mx-auto mb-1" />
            <p className="text-sm text-red-700">Ticket processing error</p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white p-3 rounded-lg border-2 border-green-200">
        <div className="grid grid-cols-9 gap-1">
          {allNumbers.map((number, index) => {
            const isMarked = number !== 0 && calledNumbers.includes(number);
            const isEmpty = number === 0;
            
            return (
              <div
                key={index}
                className={`
                  aspect-square flex items-center justify-center text-xs font-bold rounded transition-all duration-200
                  ${isEmpty 
                    ? 'bg-gray-100' 
                    : isMarked 
                      ? 'bg-green-500 text-white shadow-md transform scale-105' 
                      : 'bg-yellow-50 text-gray-800 border border-gray-300'
                  }
                `}
              >
                {number !== 0 ? number : ''}
              </div>
            );
          })}
        </div>
        {!hostMode && (
          <p className="text-xs text-gray-600 mt-2 text-center">
            ✅ Green numbers were called and marked
          </p>
        )}
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="ml-3 text-gray-600">Loading game results...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-300">
        <CardContent className="p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Results</h3>
          <p className="text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!gameData || !gameData.gameState.gameOver) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Game Not Completed</h3>
          <p className="text-gray-600">Results will appear when the game ends.</p>
        </CardContent>
      </Card>
    );
  }
  
  const wonPrizes = Object.values(gameData.prizes).filter(p => p.won);
  const totalWinners = wonPrizes.reduce((total, prize) => total + (prize.winners?.length || 0), 0);
  
  // 🎯 NEW: HOST CELEBRATION MODE - Clean, screenshot-worthy design
  if (hostMode) {
    return (
      <div className="space-y-6">
        {/* Celebration Header */}
        <Card className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0">
          <CardContent className="text-center py-8">
            <Trophy className="w-16 h-16 mx-auto mb-4 animate-bounce" />
            <h1 className="text-4xl font-bold mb-2">🎉 Game Completed! 🎉</h1>
            <p className="text-xl opacity-90">
              Congratulations to all {totalWinners} winner{totalWinners !== 1 ? 's' : ''}!
            </p>
            {gameStats && (
              <p className="text-sm opacity-75 mt-2">
                Completed on {gameStats.endTime.toLocaleDateString()} at {gameStats.endTime.toLocaleTimeString()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Game Statistics */}
        {gameStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Hash className="w-5 h-5 mr-2" />
                Game Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <Hash className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                  <div className="text-2xl font-bold text-blue-800">{gameStats.numbersCalledCount}/90</div>
                  <div className="text-sm text-blue-700">Numbers Called</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                  <Clock className="w-6 h-6 mx-auto mb-2 text-green-600" />
                  <div className="text-2xl font-bold text-green-800">{gameStats.duration}</div>
                  <div className="text-sm text-green-700">Duration</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <Users className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                  <div className="text-2xl font-bold text-purple-800">{gameStats.totalPlayers}</div>
                  <div className="text-sm text-purple-700">Players</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <Trophy className="w-6 h-6 mx-auto mb-2 text-orange-600" />
                  <div className="text-2xl font-bold text-orange-800">{wonPrizes.length}</div>
                  <div className="text-sm text-orange-700">Prizes Won</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Winners Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Trophy className="w-5 h-5 mr-2 text-yellow-600" />
              🏆 Prize Winners
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wonPrizes.length === 0 ? (
              <div className="text-center py-6">
                <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No prizes were won in this game.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {wonPrizes
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((prize) => (
                  <Card 
                    key={prize.id} 
                    className={`${
                      prize.id === 'fullHouse' 
                        ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-400 border-2' 
                        : 'bg-green-50 border-green-200'
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center">
                          <div className={`p-2 rounded-full ${
                            prize.id === 'fullHouse' ? 'bg-yellow-400' : 'bg-green-500'
                          }`}>
                            {prize.id === 'fullHouse' ? (
                              <Star className="w-5 h-5 text-white" />
                            ) : (
                              <Trophy className="w-5 h-5 text-white" />
                            )}
                          </div>
                          <div className="ml-3">
                            <h3 className={`text-lg font-bold ${
                              prize.id === 'fullHouse' ? 'text-yellow-800' : 'text-green-800'
                            }`}>
                              {prize.name}
                              {prize.id === 'fullHouse' && ' ⭐ FINAL WINNER!'}
                            </h3>
                            <p className={`text-sm ${
                              prize.id === 'fullHouse' ? 'text-yellow-700' : 'text-green-600'
                            }`}>
                              {prize.pattern}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className={
                            prize.id === 'fullHouse' 
                              ? 'bg-yellow-500 text-white' 
                              : 'bg-green-600 text-white'
                          }>
                            {prize.winners?.length || 0} winner{(prize.winners?.length || 0) !== 1 ? 's' : ''}
                          </Badge>
                          {prize.winningNumber && (
                            <p className="text-xs text-gray-600 mt-1">
                              Won on #{prize.winningNumber}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Winners List - Clean Format */}
                      {prize.winners && prize.winners.length > 0 && (
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {prize.winners.map((winner, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <div className="flex items-center">
                                  <User className="w-4 h-4 text-gray-600 mr-2" />
                                  <span className="font-medium text-gray-800">{winner.name}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-sm text-gray-600">Ticket {winner.ticketId}</span>
                                  {winner.phone && (
                                    <p className="text-xs text-gray-500 flex items-center">
                                      <Phone className="w-3 h-3 mr-1" />
                                      {winner.phone}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create New Game Button */}
        {onCreateNewGame && (
          <Card>
            <CardContent className="p-6 text-center">
              <Button 
                onClick={onCreateNewGame} 
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 text-lg"
                size="lg"
              >
                <Play className="w-5 h-5 mr-2" />
                Create New Game
              </Button>
              <p className="text-sm text-gray-600 mt-3">
                Start a fresh game when you're ready
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // 🔄 EXISTING: Original detailed view for public users (unchanged)
  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Game Completion Header */}
        <Card className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold">
              🎉 {gameData.name} - Game Completed! 🎉
            </CardTitle>
            <div className="text-lg opacity-90 mt-2">
              <p>Congratulations to all {totalWinners} winners!</p>
              {gameStats && (
                <p className="text-sm opacity-75 mt-1">
                  Game completed on {gameStats.endTime.toLocaleDateString()} at {gameStats.endTime.toLocaleTimeString()}
                </p>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Game Timeline */}
        {gameStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="w-5 h-5 mr-2" />
                Game Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <Calendar className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                  <div className="text-sm text-blue-700">Completed At</div>
                  <div className="font-bold text-blue-800 text-xs">
                    {gameStats.endTime.toLocaleString()}
                  </div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                  <Clock className="w-6 h-6 mx-auto mb-2 text-green-600" />
                  <div className="text-sm text-green-700">Duration</div>
                  <div className="font-bold text-green-800">{gameStats.duration}</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <Hash className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                  <div className="text-sm text-purple-700">Numbers Called</div>
                  <div className="font-bold text-purple-800">
                    {gameStats.numbersCalledCount}/90
                  </div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <Users className="w-6 h-6 mx-auto mb-2 text-orange-600" />
                  <div className="text-sm text-orange-700">Total Winners</div>
                  <div className="font-bold text-orange-800">{totalWinners}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prize Winners Display - Detailed for Public */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <Trophy className="w-5 h-5 mr-2" />
                Prize Winners
              </div>
              <Badge className="bg-green-600 text-white">
                {wonPrizes.length} prize{wonPrizes.length !== 1 ? 's' : ''} won
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {wonPrizes
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((prize) => (
                <Card key={prize.id} className="bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-green-800 text-lg flex items-center">
                          🏆 {prize.name}
                          {prize.winningNumber && (
                            <Badge variant="outline" className="ml-3 text-green-700 border-green-400">
                              Won on #{prize.winningNumber}
                            </Badge>
                          )}
                        </h3>
                        <p className="text-sm text-green-600">{prize.pattern}</p>
                        <p className="text-xs text-green-700 mt-1">{prize.description}</p>
                        {prize.wonAt && (
                          <p className="text-xs text-green-600 mt-1">
                            Won at: {new Date(prize.wonAt).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                      <Badge className="bg-green-600 text-white">
                        {prize.winners?.length || 0} winner{(prize.winners?.length || 0) !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    {/* Winners List with Expandable Tickets */}
                    {prize.winners && prize.winners.length > 0 && (
                      <div className="space-y-3">
                        {prize.winners.map((winner, idx) => {
                          const winnerId = `${prize.id}-${idx}`;
                          const isExpanded = expandedWinners.has(winnerId);
                          const winnerTicket = gameData.tickets[winner.ticketId];
                          
                          return (
                            <div key={winnerId} className="bg-white rounded-lg border border-green-200 overflow-hidden">
                              <Button
                                variant="ghost"
                                onClick={() => toggleWinnerTicket(winnerId)}
                                className="w-full justify-between p-4 h-auto hover:bg-green-50"
                              >
                                <div className="flex items-center space-x-3">
                                  <div className="bg-green-100 p-2 rounded-full">
                                    <Ticket className="w-4 h-4 text-green-600" />
                                  </div>
                                  <div className="text-left">
                                    <p className="font-semibold text-gray-800 flex items-center">
                                      <User className="w-4 h-4 mr-1" />
                                      {winner.name}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      Ticket {winner.ticketId}
                                    </p>
                                    {winner.phone && (
                                      <p className="text-xs text-gray-500 flex items-center mt-1">
                                        <Phone className="w-3 h-3 mr-1" />
                                        {winner.phone}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-xs text-gray-500 mr-2">
                                    {isExpanded ? 'Hide' : 'Show'} Ticket
                                  </span>
                                  {isExpanded ? 
                                    <ChevronUp className="w-4 h-4 text-green-600" /> : 
                                    <ChevronDown className="w-4 h-4 text-green-600" />
                                  }
                                </div>
                              </Button>
                              
                              {/* Expandable Winning Ticket */}
                              {isExpanded && (
                                <div className="p-4 bg-gray-50 border-t border-green-200">
                                  <div className="flex items-center justify-between mb-3">
                                    <h5 className="font-medium text-gray-800 flex items-center">
                                      <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                                      Winning Ticket {winner.ticketId}
                                    </h5>
                                    <Badge variant="outline" className="text-green-700 border-green-400">
                                      {prize.name} Winner
                                    </Badge>
                                  </div>
                                  {winnerTicket ? (
                                    renderWinningTicket(winnerTicket, gameData.gameState.calledNumbers || [])
                                  ) : (
                                    <div className="text-center py-4 text-gray-500">
                                      <Ticket className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                                      <p className="text-sm">Ticket data not available</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* No Winners Message */}
            {wonPrizes.length === 0 && (
              <div className="text-center py-8">
                <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No Prizes Won</h3>
                <p className="text-gray-600">No prizes were won in this game.</p>
                <p className="text-sm text-gray-500 mt-1">
                  Game ended with {gameData.gameState.calledNumbers?.length || 0} numbers called.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
