// src/components/RecentWinnersDisplay.tsx - NEW: Complete winner display component
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
  AlertCircle
} from 'lucide-react';
import { useGameData } from '@/providers/GameDataProvider';
import { TambolaTicket } from '@/services/firebase';

export const RecentWinnersDisplay: React.FC = () => {
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
  
  // Calculate game duration
  const gameDuration = useMemo(() => {
    if (!gameData) return '';
    
    const startTime = new Date(gameData.createdAt);
    const endTime = new Date(gameData.lastWinnerAt || gameData.createdAt);
    const durationMs = endTime.getTime() - startTime.getTime();
    
    const minutes = Math.floor(durationMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }, [gameData]);

  // ✅ SAFETY: Comprehensive ticket rendering with error recovery
  const renderWinningTicket = (ticket: TambolaTicket, calledNumbers: number[]) => {
    // Safety check 1: Verify ticket exists
    if (!ticket) {
      return (
        <div className="bg-gray-100 p-4 rounded-lg border-2 border-gray-200">
          <div className="text-center py-4">
            <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Loading ticket...</p>
          </div>
        </div>
      );
    }

    // Safety check 2: Verify ticket has rows property
    if (!ticket.rows) {
      return (
        <div className="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
          <div className="text-center py-4">
            <Clock className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
            <p className="text-sm text-yellow-700">
              Ticket {ticket.ticketId} - Data updating...
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              Please wait while ticket data loads
            </p>
          </div>
        </div>
      );
    }

    // Safety check 3: Verify rows is an array with proper structure
    if (!Array.isArray(ticket.rows) || ticket.rows.length !== 3) {
      return (
        <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
          <div className="text-center py-4">
            <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <p className="text-sm text-red-700">
              Ticket {ticket.ticketId} - Invalid data structure
            </p>
            <p className="text-xs text-red-600 mt-1">
              Expected 3 rows, got {Array.isArray(ticket.rows) ? ticket.rows.length : 'non-array'}
            </p>
          </div>
        </div>
      );
    }

    // Safety check 4: Verify each row is an array with proper length
    const isValidStructure = ticket.rows.every(row => Array.isArray(row) && row.length === 9);
    if (!isValidStructure) {
      return (
        <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
          <div className="text-center py-4">
            <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <p className="text-sm text-red-700">
              Ticket {ticket.ticketId} - Corrupted grid structure
            </p>
            <p className="text-xs text-red-600 mt-1">
              Each row should have 9 columns
            </p>
          </div>
        </div>
      );
    }

    // Safety check 5: Safe flattening with error handling
    let allNumbers: number[] = [];
    try {
      allNumbers = ticket.rows.flat();
      if (allNumbers.length !== 27) {
        throw new Error(`Expected 27 cells, got ${allNumbers.length}`);
      }
    } catch (error) {
      console.error('Error processing ticket rows:', error, ticket);
      return (
        <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
          <div className="text-center py-4">
            <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <p className="text-sm text-red-700">
              Ticket {ticket.ticketId} - Processing error
            </p>
            <p className="text-xs text-red-600 mt-1">
              Grid processing failed: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      );
    }

    // ✅ ALL CHECKS PASSED: Render the winning ticket with highlighted numbers
    return (
      <div className="bg-white p-4 rounded-lg border-2 border-green-200">
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
                      ? 'bg-green-500 text-white shadow-md transform scale-105 ring-2 ring-green-300' 
                      : 'bg-yellow-50 text-gray-800 border border-gray-300'
                  }
                `}
              >
                {number !== 0 ? number : ''}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-600 mt-2 text-center">
          ✅ Green numbers were called and marked for this prize
        </p>
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading Winners...</h2>
            <p className="text-sm text-gray-600">Fetching game results</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 flex items-center justify-center">
        <Card className="border-red-300">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error Loading Game</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Game not found or not completed
  if (!gameData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Game Not Found</h2>
            <p className="text-gray-600">This game doesn't exist or is no longer available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not a completed game
  if (!gameData.gameState.gameOver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Game Not Completed</h2>
            <p className="text-gray-600">This game hasn't finished yet. Winners will appear here once the game ends.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const wonPrizes = Object.values(gameData.prizes).filter(p => p.won);
  const gameEndTime = new Date(gameData.lastWinnerAt || gameData.createdAt);
  const totalWinners = wonPrizes.reduce((total, prize) => total + (prize.winners?.length || 0), 0);
  
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
              <p className="text-sm opacity-75 mt-1">
                Game completed on {gameEndTime.toLocaleDateString()} at {gameEndTime.toLocaleTimeString()}
              </p>
            </div>
          </CardHeader>
        </Card>

        {/* Game Timeline */}
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
                  {gameEndTime.toLocaleString()}
                </div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                <Clock className="w-6 h-6 mx-auto mb-2 text-green-600" />
                <div className="text-sm text-green-700">Duration</div>
                <div className="font-bold text-green-800">{gameDuration}</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                <Hash className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                <div className="text-sm text-purple-700">Numbers Called</div>
                <div className="font-bold text-purple-800">
                  {gameData.gameState.calledNumbers?.length || 0}/90
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

        {/* Prize Winners Display */}
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
                .sort((a, b) => (a.order || 0) - (b.order || 0)) // Sort by prize order
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
                                      <p className="text-xs text-gray-400 mt-1">
                                        This may happen if the game data was cleaned up
                                      </p>
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

        {/* Game Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Hash className="w-5 h-5 mr-2" />
              Final Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-800">
                  {Object.keys(gameData.tickets || {}).length}
                </div>
                <div className="text-sm text-gray-600">Total Tickets</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {Object.values(gameData.tickets || {}).filter(t => t.isBooked).length}
                </div>
                <div className="text-sm text-blue-700">Players</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {Object.keys(gameData.prizes).length}
                </div>
                <div className="text-sm text-purple-700">Total Prizes</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {Math.round(((gameData.gameState.calledNumbers?.length || 0) / 90) * 100)}%
                </div>
                <div className="text-sm text-green-700">Numbers Called</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
