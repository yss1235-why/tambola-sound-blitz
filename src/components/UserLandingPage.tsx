import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Trophy, Clock, Phone } from 'lucide-react';
import TambolaGame from './TambolaGame';
import { TicketBookingGrid } from './TicketBookingGrid';

export const UserLandingPage: React.FC = () => {
  const [hasJoinedGame, setHasJoinedGame] = useState(false);
  const [showTickets, setShowTickets] = useState(true); // Show tickets by default

  if (hasJoinedGame) {
    return <TambolaGame />;
  }

  if (showTickets) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <TicketBookingGrid playerName="Player" onGameStart={() => setHasJoinedGame(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-slate-800 mb-6">
            🎲 Tambola Time! 🎉
          </h1>
          <p className="text-2xl text-slate-600 mb-8">
            Join the fun and win amazing prizes!
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <Card className="bg-white/80 backdrop-blur-sm border-2 border-slate-200 rounded-2xl shadow-xl">
            <CardContent className="text-center p-8">
              <Phone className="w-16 h-16 mx-auto text-slate-600 mb-6" />
              <h3 className="text-xl font-bold text-slate-800 mb-3">WhatsApp Booking</h3>
              <p className="text-slate-600">Book tickets easily through WhatsApp - no complex registration needed!</p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-2 border-slate-200 rounded-2xl shadow-xl">
            <CardContent className="text-center p-8">
              <Clock className="w-16 h-16 mx-auto text-slate-600 mb-6" />
              <h3 className="text-xl font-bold text-slate-800 mb-3">Live Action</h3>
              <p className="text-slate-600">Real-time number calling with automatic marking and instant updates.</p>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-2 border-slate-200 rounded-2xl shadow-xl">
            <CardContent className="text-center p-8">
              <Trophy className="w-16 h-16 mx-auto text-slate-600 mb-6" />
              <h3 className="text-xl font-bold text-slate-800 mb-3">Multiple Prizes</h3>
              <p className="text-slate-600">Win various prizes including Lines, Corners, and Full House!</p>
            </CardContent>
          </Card>
        </div>

        {/* How to Play */}
        <Card className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200 p-6">
          <CardHeader>
            <CardTitle className="text-3xl text-slate-800 text-center">How to Play</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-xl text-slate-800 mb-3">1. View Available Tickets</h4>
                  <p className="text-slate-600 text-lg">Browse all available tickets for the current game without any registration.</p>
                </div>
                
                <div>
                  <h4 className="font-bold text-xl text-slate-800 mb-3">2. Book Your Tickets</h4>
                  <p className="text-slate-600 text-lg">Click on any available ticket to book it via WhatsApp instantly.</p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-xl text-slate-800 mb-3">3. Play & Win</h4>
                  <p className="text-slate-600 text-lg">Numbers are called automatically and marked on your tickets. Complete patterns to win!</p>
                </div>
                
                <div>
                  <h4 className="font-bold text-xl text-slate-800 mb-3">4. Claim Prizes</h4>
                  <p className="text-slate-600 text-lg">Prizes are automatically detected and claimed when you complete winning patterns.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
