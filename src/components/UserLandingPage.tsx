
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Trophy, Clock, Phone } from 'lucide-react';
import TambolaGame from './TambolaGame';
import { TicketBookingGrid } from './TicketBookingGrid';

export const UserLandingPage: React.FC = () => {
  const [playerName, setPlayerName] = useState('');
  const [hasJoinedGame, setHasJoinedGame] = useState(false);
  const [showTickets, setShowTickets] = useState(false);

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim()) {
      setShowTickets(true);
    }
  };

  if (hasJoinedGame) {
    return <TambolaGame />;
  }

  if (showTickets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Card className="tambola-card mb-8">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl text-orange-800">
                🎲 Welcome {playerName}! 🎲
              </CardTitle>
              <p className="text-orange-600">Book your tickets and get ready to play!</p>
            </CardHeader>
          </Card>
          
          <TicketBookingGrid playerName={playerName} onGameStart={() => setHasJoinedGame(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-orange-800 mb-6">
            🎲 Tambola Time! 🎉
          </h1>
          <p className="text-2xl text-orange-600 mb-8">
            Join the fun and win amazing prizes!
          </p>
        </div>

        {/* Player Entry Card */}
        <Card className="tambola-card mb-12">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl text-orange-800">Ready to Play?</CardTitle>
            <p className="text-orange-600 text-lg">Enter your name to see available tickets</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinGame} className="space-y-6">
              <div className="max-w-md mx-auto">
                <Label htmlFor="player-name" className="text-lg font-semibold text-orange-800">Your Name</Label>
                <Input
                  id="player-name"
                  type="text"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  required
                  className="mt-2 text-lg p-4 border-2 border-orange-200 focus:border-orange-400"
                />
              </div>
              <div className="text-center">
                <Button type="submit" size="lg" className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-8 py-4 text-lg font-bold rounded-xl shadow-lg hover:from-orange-600 hover:to-red-600 transition-all duration-200 hover:scale-105">
                  <Users className="w-6 h-6 mr-3" />
                  View Available Tickets
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Demo Game Card */}
        <Card className="tambola-card mb-12">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-orange-800">Try Demo Game</CardTitle>
            <p className="text-orange-600">Experience Tambola without booking tickets</p>
          </CardHeader>
          <CardContent className="text-center">
            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => setHasJoinedGame(true)}
              className="border-2 border-orange-400 text-orange-600 hover:bg-orange-50 px-8 py-4 text-lg font-semibold rounded-xl"
            >
              <Trophy className="w-5 h-5 mr-2" />
              Start Demo Game
            </Button>
          </CardContent>
        </Card>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <Card className="bg-white/80 backdrop-blur-sm border-2 border-orange-200 rounded-2xl shadow-xl">
            <CardContent className="text-center p-8">
              <Phone className="w-16 h-16 mx-auto text-orange-500 mb-6" />
              <h3 className="text-xl font-bold text-orange-800 mb-3">WhatsApp Booking</h3>
              <p className="text-orange-600">Book tickets easily through WhatsApp - no complex registration needed!</p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-2 border-orange-200 rounded-2xl shadow-xl">
            <CardContent className="text-center p-8">
              <Clock className="w-16 h-16 mx-auto text-green-500 mb-6" />
              <h3 className="text-xl font-bold text-orange-800 mb-3">Live Action</h3>
              <p className="text-orange-600">Real-time number calling with automatic marking and instant updates.</p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-2 border-orange-200 rounded-2xl shadow-xl">
            <CardContent className="text-center p-8">
              <Trophy className="w-16 h-16 mx-auto text-yellow-500 mb-6" />
              <h3 className="text-xl font-bold text-orange-800 mb-3">Multiple Prizes</h3>
              <p className="text-orange-600">Win various prizes including Lines, Corners, and Full House!</p>
            </CardContent>
          </Card>
        </div>

        {/* How to Play */}
        <Card className="tambola-card">
          <CardHeader>
            <CardTitle className="text-3xl text-orange-800 text-center">How to Play</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-xl text-orange-800 mb-3">1. Enter Your Name</h4>
                  <p className="text-orange-600 text-lg">Simply enter your name to see all available tickets for the current game.</p>
                </div>
                
                <div>
                  <h4 className="font-bold text-xl text-orange-800 mb-3">2. Book Your Tickets</h4>
                  <p className="text-orange-600 text-lg">Click on any available ticket to book it via WhatsApp instantly.</p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-xl text-orange-800 mb-3">3. Play & Win</h4>
                  <p className="text-orange-600 text-lg">Numbers are called automatically and marked on your tickets. Complete patterns to win!</p>
                </div>
                
                <div>
                  <h4 className="font-bold text-xl text-orange-800 mb-3">4. Claim Prizes</h4>
                  <p className="text-orange-600 text-lg">Prizes are automatically detected and claimed when you complete winning patterns.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
