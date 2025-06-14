// src/components/TambolaGame.tsx - Fixed all search and visibility issues
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NumberGrid } from './NumberGrid';
import { TicketDisplay } from './TicketDisplay';
import { AudioManager } from './AudioManager';
import { firebaseService, GameData, TambolaTicket, Prize } from '@/services/firebase';
import { 
  Search,
  X,
  Trophy,
  Users,
  ChevronDown,
  ChevronUp,
  Ticket,
  Clock,
  User
} from 'lucide-react';

interface TambolaGameProps {
  gameData: GameData;
  onBackToTickets?: () => void;
}

interface SearchedPlayer {
  playerName: string;
  tickets: TambolaTicket[];
  searchId: string; // Unique ID for managing deletion
}

export const TambolaGame: React.FC<TambolaGameProps> = ({ gameData: initialGameData }) => {
  const [gameData, setGameData] = useState<GameData>(initialGameData);
  const [tickets, setTickets] = useState<{ [key: string]: TambolaTicket }>({});
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  
  // Prize details expansion state
  const [expandedPrizes, setExpandedPrizes] = useState<Set<string>>(new Set());
  
  // Ticket search state - Back to grouping by player
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedPlayers, setSearchedPlayers] = useState<SearchedPlayer[]>([]);
  
  // Subscription management
  const gameUnsubscribeRef = useRef<(() => void) | null>(null);
  const ticketsUnsubscribeRef = useRef<(() => void) | null>(null);

  // Game subscription
  const setupGameSubscription = useCallback(() => {
    if (gameUnsubscribeRef.current) {
      gameUnsubscribeRef.current();
      gameUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToGame(gameData.gameId, (updatedGame) => {
      if (updatedGame) {
        setGameData(updatedGame);
        setCalledNumbers(updatedGame.gameState.calledNumbers || []);
        setCurrentNumber(updatedGame.gameState.currentNumber || null);
      }
    });

    gameUnsubscribeRef.current = unsubscribe;
  }, [gameData.gameId]);

  // Tickets subscription
  const setupTicketsSubscription = useCallback(() => {
    if (ticketsUnsubscribeRef.current) {
      ticketsUnsubscribeRef.current();
      ticketsUnsubscribeRef.current = null;
    }

    const unsubscribe = firebaseService.subscribeToTickets(gameData.gameId, (updatedTickets) => {
      if (updatedTickets) {
        setTickets(updatedTickets);
      }
    });

    ticketsUnsubscribeRef.current = unsubscribe;
  }, [gameData.gameId]);

  // Setup subscriptions
  useEffect(() => {
    setCalledNumbers(gameData.gameState.calledNumbers || []);
    setCurrentNumber(gameData.gameState.currentNumber || null);
    
    if (gameData.tickets) {
      setTickets(gameData.tickets);
    }

    setupGameSubscription();
    setupTicketsSubscription();

    return () => {
      if (gameUnsubscribeRef.current) {
        gameUnsubscribeRef.current();
      }
      if (ticketsUnsubscribeRef.current) {
        ticketsUnsubscribeRef.current();
      }
    };
  }, [gameData.gameId, setupGameSubscription, setupTicketsSubscription]);

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

  // Handle ticket search - Find all tickets by player
  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    const searchedTicketId = searchQuery.trim();
    const ticket = tickets[searchedTicketId];

    if (ticket && ticket.isBooked && ticket.playerName) {
      // Find all tickets by this player
      const playerTickets = Object.values(tickets).filter(
        t => t.isBooked && t.playerName === ticket.playerName
      );

      // Check if we already have this player in search results
      const existingPlayerIndex = searchedPlayers.findIndex(
        p => p.playerName === ticket.playerName
      );

      if (existingPlayerIndex === -1) {
        // Add new player search result with unique ID
        setSearchedPlayers(prev => [...prev, {
          playerName: ticket.playerName!,
          tickets: playerTickets,
          searchId: `${ticket.playerName}-${Date.now()}` // Unique ID for deletion
        }]);
      } else {
        // Player already exists, add as a new search instance (for stacking)
        setSearchedPlayers(prev => [...prev, {
          playerName: ticket.playerName!,
          tickets: playerTickets,
          searchId: `${ticket.playerName}-${Date.now()}` // New unique ID
        }]);
      }
    }

    setSearchQuery('');
  };

  // Remove searched player group
  const removeSearchedPlayer = (searchId: string) => {
    setSearchedPlayers(prev => prev.filter(item => item.searchId !== searchId));
  };

  // Convert prizes for display
  const prizes = Object.values(gameData.prizes);

  // Game phases
  const isGameActive = gameData.gameState.isActive || gameData.gameState.isCountdown;
  const isGameOver = gameData.gameState.gameOver;

  // Helper function to render a ticket with proper visibility
  const renderTicketWithVisibility = (ticket: TambolaTicket, showPlayerInfo: boolean = true) => {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Simplified Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold">🎲 {gameData.name} 🎲</CardTitle>
            <p className="text-blue-100 text-lg">
              {isGameOver ? 'Game Complete!' : 
               gameData.gameState.isCountdown ? 'Game Starting Soon!' : 
               isGameActive ? 'Game in Progress' : 'Waiting to Start'}
            </p>
          </CardHeader>
        </Card>

        {/* Countdown Display */}
        {gameData.gameState.isCountdown && (
          <Card className="bg-gradient-to-r from-yellow-400 to-red-500 text-white border-0">
            <CardContent className="text-center py-8">
              <Clock className="w-12 h-12 mx-auto mb-4 animate-pulse" />
              <div className="text-6xl font-bold animate-bounce">
                {gameData.gameState.countdownTime}
              </div>
              <p className="text-xl mt-2">Get ready to mark your numbers!</p>
            </CardContent>
          </Card>
        )}

        {/* Current Number Display */}
        {currentNumber && !isGameOver && (
          <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white border-0">
            <CardContent className="text-center py-8">
              <p className="text-2xl mb-4">Current Number</p>
              <div className="text-8xl font-bold animate-pulse">{currentNumber}</div>
              <p className="text-lg mt-4 opacity-90">Mark this number on your ticket!</p>
            </CardContent>
          </Card>
        )}

        {/* Main Game Content */}
        {!isGameOver && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Number Grid - Simplified */}
            <div className="lg:col-span-2">
              <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
                <CardHeader>
                  <CardTitle className="text-center text-gray-800">
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

            {/* Prizes with Expandable Winner Details - Fixed visibility */}
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

                      {/* Winner Details - Fixed visibility */}
                      {prize.won && expandedPrizes.has(prize.id) && prize.winners && (
                        <div className="mt-2 p-3 bg-white rounded border border-green-200">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-gray-700">
                                Winners: {prize.winners.length}
                              </span>
                              {prize.winningNumber && (
                                <Badge variant="outline" className="text-gray-700 border-gray-300">
                                  Won on #{prize.winningNumber}
                                </Badge>
                              )}
                            </div>
                            <div className="space-y-1">
                              {prize.winners.map((winner, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm p-2 bg-green-50 rounded">
                                  <div className="flex items-center space-x-2">
                                    <User className="w-3 h-3 text-green-600" />
                                    <span className="font-medium text-gray-800">{winner.name}</span>
                                  </div>
                                  <Badge variant="secondary" className="bg-white text-gray-700 border-gray-300">
                                    Ticket {winner.ticketId}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                            {prize.wonAt && (
                              <p className="text-xs text-gray-500 text-center">
                                Won at {new Date(prize.wonAt).toLocaleTimeString()}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Player Tickets with Search - Shows all player tickets */}
        {isGameActive && !isGameOver && Object.keys(tickets).length > 0 && (
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
              </div>

              {/* Search Instructions */}
              {searchedPlayers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Ticket className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>Search for any of your ticket numbers to view all your booked tickets</p>
                  <p className="text-sm mt-2">Enter any ticket number and we'll show all tickets booked by you</p>
                </div>
              )}

              {/* Search Results - Grouped by player with all tickets */}
              {searchedPlayers.map((player) => (
                <div key={player.searchId} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-gray-800 flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      {player.playerName}'s Tickets ({player.tickets.length})
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSearchedPlayer(player.searchId)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <TicketDisplay 
                    calledNumbers={calledNumbers} 
                    tickets={player.tickets}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Game Over Display - Fixed winner ticket display */}
        {isGameOver && (
          <div className="space-y-6">
            {/* Game Over Header */}
            <Card className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0">
              <CardContent className="text-center py-12">
                <Trophy className="w-16 h-16 mx-auto mb-4" />
                <h2 className="text-4xl font-bold mb-2">🎉 Game Over! 🎉</h2>
                <p className="text-xl">Congratulations to all winners!</p>
              </CardContent>
            </Card>

            {/* Prize Winners - Fixed ticket display and visibility */}
            <Card className="bg-white/90 backdrop-blur-sm border border-blue-200">
              <CardHeader>
                <CardTitle className="text-gray-800">Prize Winners</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {prizes.filter(p => p.won).map((prize) => (
                  <div key={prize.id}>
                    <div
                      className="p-4 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 cursor-pointer hover:shadow-lg transition-all"
                      onClick={() => togglePrizeDetails(prize.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-green-800 text-lg">{prize.name}</h3>
                          <p className="text-green-600">{prize.pattern}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="default" className="bg-green-500 text-white">
                            {prize.winners?.length || 0} Winner{(prize.winners?.length || 0) !== 1 ? 's' : ''}
                          </Badge>
                          {expandedPrizes.has(prize.id) ? 
                            <ChevronUp className="w-4 h-4 text-green-600" /> : 
                            <ChevronDown className="w-4 h-4 text-green-600" />
                          }
                        </div>
                      </div>
                      {/* Fixed: Show "Won by" text with proper visibility */}
                      {prize.winners && prize.winners.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm font-medium text-green-700">
                            Won by: {prize.winners.map(w => w.name).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Winner Tickets - Fixed to show ticket grids */}
                    {expandedPrizes.has(prize.id) && prize.winners && (
                      <div className="mt-3 p-4 bg-white rounded-lg border border-green-200">
                        <div className="space-y-4">
                          {prize.winners.map((winner, idx) => {
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
                                {/* Show the actual ticket grid */}
                                {renderTicketWithVisibility(winnerTicket, false)}
                              </div>
                            ) : (
                              <div key={idx} className="text-center py-4 text-gray-500">
                                <p>Ticket {winner.ticketId} data not available</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {prizes.filter(p => p.won).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No prizes were won in this game</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Audio Manager */}
        <AudioManager
          currentNumber={currentNumber}
          prizes={prizes}
        />
      </div>
    </div>
  );
};
