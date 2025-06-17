// src/components/UserDisplay.tsx - FIXED: Added AudioManager for users
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search,
  X,
  Trophy,
  Users,
  ChevronDown,
  ChevronUp,
  Ticket,
  Clock,
  User,
  Hash
} from 'lucide-react';
import { useGameData } from '@/providers/GameDataProvider';
import { NumberGrid } from './NumberGrid';
import { AudioManager } from './AudioManager'; // ✅ FIXED: Added AudioManager
import { AudioStatusComponent } from './AudioStatusComponent'; // ✅ FIXED: Added audio status
import { TambolaTicket } from '@/services/firebase';

interface SearchedTicket {
  ticket: TambolaTicket;
  playerName: string;
  uniqueId: string;
}

export const UserDisplay: React.FC = () => {
  const { gameData, currentPhase, timeUntilAction, isLoading } = useGameData();
  
  // Local state for user interactions (search, etc.)
  const [expandedPrizes, setExpandedPrizes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedTickets, setSearchedTickets] = useState<SearchedTicket[]>([]);

  // Extract data safely
  const tickets = gameData?.tickets || {};
  const calledNumbers = gameData?.gameState.calledNumbers || [];
  const currentNumber = gameData?.gameState.currentNumber;
  const prizes = gameData ? Object.values(gameData.prizes) : [];

  // Initialize expanded prizes for won prizes
  React.useEffect(() => {
    if (currentPhase === 'finished') {
      const wonPrizeIds = prizes
        .filter(prize => prize.won)
        .map(prize => prize.id);
      
      if (wonPrizeIds.length > 0) {
        setExpandedPrizes(new Set(wonPrizeIds));
      }
    }
  }, [prizes, currentPhase]);

  // Toggle prize details
  const togglePrizeDetails = (prizeId: string) => {
    setExpandedPrizes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(prizeId)) {
        newSet.delete(prizeId);
      } else {
        newSet.add(prizeId);
      }
      return newSet;
    });
  };

  // Handle ticket search
  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    const searchedTicketId = searchQuery.trim();
    const ticket = tickets[searchedTicketId];

    if (ticket && ticket.isBooked && ticket.playerName) {
      // Find all tickets by this player
      const playerTickets = Object.values(tickets).filter(
        t => t.isBooked && t.playerName === ticket.playerName
      );

      // Add each ticket individually to the search results
      const newSearchedTickets: SearchedTicket[] = playerTickets.map(t => ({
        ticket: t,
        playerName: t.playerName!,
        uniqueId: `${t.ticketId}-${Date.now()}-${Math.random()}`
      }));

      setSearchedTickets(prev => [...prev, ...newSearchedTickets]);
    }

    setSearchQuery('');
  };

  // Remove individual searched ticket
  const removeSearchedTicket = (uniqueId: string) => {
    setSearchedTickets(prev => prev.filter(item => item.uniqueId !== uniqueId));
  };

  // Helper function to render a ticket
  const renderTicket = (ticket: TambolaTicket, showPlayerInfo: boolean = true) => {
    return (
      <div className="bg-white p-4 rounded-lg border-2 border-blue-200">
        {showPlayerInfo && ticket.playerName && (
          <div className="mb-3 text-center">
            <p className="font-semibold text-gray-800">Ticket {ticket.ticketId}</p>
            <p className="text-sm text-gray-600">{ticket.playerName}</p>
          </div>
        )}
        <div className="grid grid-cols-9 gap-1">
          {ticket.rows.flat().map((number, index) => {
            const isMarked = number !== 0 && calledNumbers.includes(number);
            const isEmpty = number === 0;
            
            return (
              <div
                key={index}
                className={`
                  aspect-square flex items-center justify-center text-xs font-bold rounded
                  ${isEmpty 
                    ? 'bg-gray-100' 
                    : isMarked 
                      ? 'bg-green-500 text-white shadow-md' 
                      : 'bg-yellow-50 text-gray-800 border border-gray-300'
                  }
                `}
              >
                {number !== 0 ? number : ''}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Helper to render prize winner tickets
  const renderPrizeWinnerTickets = (prize: any) => {
    if (!prize.winners || prize.winners.length === 0) return null;

    return (
      <div className="mt-3 p-4 bg-white rounded-lg border border-green-200">
        <div className="space-y-4">
          {prize.winners.map((winner: any, idx: number) => {
            const winnerTicket = tickets[winner.ticketId];
            return winnerTicket ? (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-gray-800">
                    <User className="w-4 h-4 inline mr-1" />
                    {winner.name} - Ticket {winner.ticketId}
                  </h5>
                  {prize.winningNumber && (
                    <Badge variant="outline" className="text-gray-700 border-gray-300">
                      Won on #{prize.winningNumber}
                    </Badge>
                  )}
                </div>
                {renderTicket(winnerTicket, false)}
              </div>
            ) : (
              <div key={idx} className="text-center py-4 text-gray-500">
                <p>Ticket {winner.ticketId} data not available</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Group searched tickets by player
  const groupedSearchResults = searchedTickets.reduce((acc, item) => {
    if (!acc[item.playerName]) {
      acc[item.playerName] = [];
    }
    acc[item.playerName].push(item);
    return acc;
  }, {} as { [playerName: string]: SearchedTicket[] });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading Game...</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!gameData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">🎲</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Game Not Found</h2>
            <p className="text-gray-600">The game you're looking for doesn't exist or has ended.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ✅ FIXED: Added Audio Status Component for Users */}
        <AudioStatusComponent />

        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold">🎲 {gameData.name} 🎲</CardTitle>
            <p className="text-blue-100 text-lg">
              {currentPhase === 'finished' ? 'Game Complete!' : 
               currentPhase === 'countdown' ? `Game Starting in ${timeUntilAction}s!` : 
               currentPhase === 'playing' ? 'Game in Progress' : 'Waiting to Start'}
            </p>
          </CardHeader>
        </Card>

        {/* Countdown Display */}
        {currentPhase === 'countdown' && (
          <Card className="bg-gradient-to-r from-yellow-400 to-red-500 text-white border-0">
            <CardContent className="text-center py-8">
              <Clock className="w-12 h-12 mx-auto mb-4 animate-pulse" />
              <div className="text-6xl font-bold animate-bounce">
                {timeUntilAction}
              </div>
              <p className="text-xl mt-2">Get ready to mark your numbers!</p>
            </CardContent>
          </Card>
        )}

        {/* Current Number Display */}
        {currentNumber && currentPhase === 'playing' && (
          <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white border-0">
            <CardContent className="text-center py-8">
              <p className="text-2xl mb-4">Current Number</p>
              <div className="text-8xl font-bold animate-pulse">{currentNumber}</div>
              <p className="text-lg mt-4 opacity-90">Mark this number on your ticket!</p>
            </CardContent>
          </Card>
        )}

        {/* Main Game Content */}
        {(currentPhase === 'playing' || currentPhase === 'finished') && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Number Grid */}
            <div className="lg:col-span-2">
              <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
                <CardHeader>
                  <CardTitle className="text-center text-gray-800 flex items-center justify-center">
                    <Hash className="w-5 h-5 mr-2" />
                    Numbers Board (1-90)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <NumberGrid
                    calledNumbers={calledNumbers}
                    currentNumber={currentNumber}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Prizes */}
            <div>
              <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
                <CardHeader>
                  <CardTitle className="text-gray-800 flex items-center">
                    <Trophy className="w-5 h-5 mr-2" />
                    Prizes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {prizes.map((prize) => (
                    <div key={prize.id}>
                      <div
                        className={`p-3 rounded-lg border-2 transition-all duration-300 ${
                          prize.won
                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 shadow-lg cursor-pointer hover:shadow-xl'
                            : 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200'
                        }`}
                        onClick={() => prize.won && togglePrizeDetails(prize.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className={`font-bold ${prize.won ? 'text-green-800' : 'text-gray-800'}`}>
                              {prize.name}
                            </h3>
                            <p className={`text-sm ${prize.won ? 'text-green-600' : 'text-gray-600'}`}>
                              {prize.pattern}
                            </p>
                            {prize.won && prize.winners && prize.winners.length > 0 && (
                              <p className="text-sm font-medium text-green-700 mt-1">
                                Won by: {prize.winners.map(w => w.name).join(', ')}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              prize.won 
                                ? 'bg-green-500 text-white' 
                                : 'bg-gray-200 text-gray-500'
                            }`}>
                              {prize.won ? '✓' : '?'}
                            </div>
                            {prize.won && (
                              expandedPrizes.has(prize.id) ? 
                                <ChevronUp className="w-4 h-4 text-green-600" /> : 
                                <ChevronDown className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Winner Tickets Display */}
                      {prize.won && expandedPrizes.has(prize.id) && renderPrizeWinnerTickets(prize)}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Player Tickets Search */}
        {(currentPhase === 'playing' || currentPhase === 'finished') && Object.keys(tickets).length > 0 && (
          <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
            <CardHeader>
              <CardTitle className="text-gray-800 flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Search Your Tickets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search Bar */}
              <div className="flex space-x-2">
                <Input
                  type="text"
                  placeholder="Enter any ticket number to find all your tickets"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={!searchQuery.trim()}>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
                {searchedTickets.length > 0 && (
                  <Button 
                    onClick={() => setSearchedTickets([])} 
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                  >
                    Clear All
                  </Button>
                )}
              </div>

              {/* Search Instructions */}
              {searchedTickets.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Ticket className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>Search for any of your ticket numbers to view all your booked tickets</p>
                  <p className="text-sm mt-2">You can remove individual tickets to track only the ones you want</p>
                </div>
              )}

              {/* Search Results */}
              {Object.entries(groupedSearchResults).map(([playerName, playerTickets]) => (
                <div key={playerName} className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-bold text-gray-800 flex items-center mb-3">
                    <User className="w-4 h-4 mr-2" />
                    {playerName}'s Tickets ({playerTickets.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {playerTickets.map((item) => (
                      <div key={item.uniqueId} className="relative">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSearchedTicket(item.uniqueId)}
                          className="absolute top-2 right-2 z-10 bg-white/90 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title={`Remove Ticket ${item.ticket.ticketId}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        {renderTicket(item.ticket, true)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Game Over Display */}
        {currentPhase === 'finished' && (
          <Card className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0">
            <CardContent className="text-center py-12">
              <Trophy className="w-16 h-16 mx-auto mb-4" />
              <h2 className="text-4xl font-bold mb-2">🎉 Game Over! 🎉</h2>
              <p className="text-xl">Congratulations to all winners!</p>
              <div className="mt-4 text-lg">
                <p>Total Numbers Called: {calledNumbers.length}</p>
                <p>Prizes Won: {prizes.filter(p => p.won).length} of {prizes.length}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Booking Phase Display */}
        {currentPhase === 'booking' && (
          <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
            <CardContent className="text-center py-12">
              <div className="text-6xl mb-4">🎫</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Booking Open</h2>
              <p className="text-gray-600 mb-4">
                Game is ready for ticket booking. Contact the host to book your tickets.
              </p>
              {gameData.hostPhone && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-blue-800 font-medium">
                    📱 Contact Host: +{gameData.hostPhone}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ✅ FIXED: Added AudioManager for Users */}
        {gameData && (
          <AudioManager
            currentNumber={gameData.gameState.currentNumber}
            prizes={Object.values(gameData.prizes)}
            onAudioComplete={() => {
              // For users, no callback needed - only hosts need timing control
              console.log('🔊 User audio announcement completed');
            }}
            forceEnable={false} // Let users enable manually
          />
        )}
      </div>
    </div>
  );
};
