
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { TicketBookingGrid } from './TicketBookingGrid';
import { TambolaGame } from './TambolaGame';
import { firebaseService, GameData, TambolaTicket } from '@/services/firebase';
import { Loader2, Users, Trophy, DollarSign } from 'lucide-react';

export const UserLandingPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<'tickets' | 'game'>('tickets');
  const [activeGames, setActiveGames] = useState<GameData[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameData | null>(null);
  const [tickets, setTickets] = useState<{ [key: string]: TambolaTicket }>({});
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadActiveGames();
  }, []);

  useEffect(() => {
    if (selectedGame) {
      // Subscribe to real-time ticket updates
      const unsubscribe = firebaseService.subscribeToTickets(selectedGame.gameId, (updatedTickets) => {
        if (updatedTickets) {
          setTickets(updatedTickets);
        }
      });

      return unsubscribe;
    }
  }, [selectedGame]);

  const loadActiveGames = async () => {
    setIsLoading(true);
    try {
      // In a real implementation, you'd fetch active games from Firebase
      // For now, we'll check if there are any games and use the first available one
      // This is a simplified approach - in reality you'd have a games list endpoint
      
      // Since we don't have a games list in the current Firebase service,
      // we'll simulate checking for active games
      setActiveGames([]);
      setSelectedGame(null);
      setTickets({});
    } catch (error: any) {
      console.error('Error loading games:', error);
      toast({
        title: "Error",
        description: "Failed to load active games",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBookTicket = async (ticketId: string, playerName: string, playerPhone: string) => {
    if (!selectedGame) return;

    try {
      await firebaseService.bookTicket(ticketId, playerName, playerPhone, selectedGame.gameId);
      
      toast({
        title: "Ticket Booked!",
        description: `Ticket ${ticketId} has been booked successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Booking Failed",
        description: error.message || "Failed to book ticket",
        variant: "destructive",
      });
    }
  };

  const getBookedTicketsCount = () => {
    return Object.values(tickets).filter(ticket => ticket.isBooked).length;
  };

  const getTotalRevenue = () => {
    if (!selectedGame) return 0;
    return getBookedTicketsCount() * selectedGame.ticketPrice;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 flex items-center justify-center">
        <Card className="p-8">
          <CardContent className="flex items-center space-x-4">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            <p className="text-lg text-gray-700">Loading active games...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentView === 'game' && selectedGame) {
    return <TambolaGame gameData={selectedGame} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Section */}
        <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              🎲 Welcome to Tambola! 🎲
            </CardTitle>
            <p className="text-gray-600 text-lg mt-2">
              Join the excitement! Book your tickets and play live Tambola games.
            </p>
          </CardHeader>
        </Card>

        {/* Game Status */}
        {selectedGame ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100">Active Players</p>
                    <p className="text-2xl font-bold">{getBookedTicketsCount()}</p>
                  </div>
                  <Users className="w-8 h-8 text-blue-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100">Total Revenue</p>
                    <p className="text-2xl font-bold">₹{getTotalRevenue()}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100">Game Status</p>
                    <p className="text-2xl font-bold">
                      {selectedGame.gameState.isActive ? 'Live' : 'Waiting'}
                    </p>
                  </div>
                  <Trophy className="w-8 h-8 text-purple-200" />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
            <CardContent className="p-8 text-center">
              <div className="text-6xl mb-4">🎯</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">No Active Games</h2>
              <p className="text-gray-600 mb-4">
                There are currently no active Tambola games. Please check back later or contact the host to start a new game.
              </p>
              <Button 
                onClick={loadActiveGames}
                className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
              >
                Refresh Games
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Ticket Booking Grid */}
        {selectedGame && Object.keys(tickets).length > 0 && (
          <TicketBookingGrid 
            tickets={tickets}
            gameData={selectedGame}
            onBookTicket={handleBookTicket}
            onGameStart={() => setCurrentView('game')}
          />
        )}

        {/* How to Play Section */}
        <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-orange-200">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-800 text-center">How to Play</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4">
              <div className="text-4xl mb-3">📱</div>
              <h3 className="font-bold text-lg text-gray-800 mb-2">Book via WhatsApp</h3>
              <p className="text-gray-600">Click on any available ticket to book it through WhatsApp messaging.</p>
            </div>
            <div className="text-center p-4">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="font-bold text-lg text-gray-800 mb-2">Mark Numbers</h3>
              <p className="text-gray-600">Mark the called numbers on your ticket during the live game.</p>
            </div>
            <div className="text-center p-4">
              <div className="text-4xl mb-3">🏆</div>
              <h3 className="font-bold text-lg text-gray-800 mb-2">Win Prizes</h3>
              <p className="text-gray-600">Complete patterns like lines, corners, or full house to win exciting prizes!</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
