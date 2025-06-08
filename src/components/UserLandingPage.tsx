
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Users, Trophy, Clock } from 'lucide-react';
import TambolaGame from './TambolaGame';

export const UserLandingPage: React.FC = () => {
  const [gameCode, setGameCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [hasJoinedGame, setHasJoinedGame] = useState(false);

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (gameCode.trim() && playerName.trim()) {
      // TODO: Implement game joining logic
      console.log('Joining game:', gameCode, 'as', playerName);
      setHasJoinedGame(true);
    }
  };

  if (hasJoinedGame) {
    return <TambolaGame />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            Welcome to Tambola! 🎲
          </h1>
          <p className="text-xl text-blue-100 mb-8">
            Join exciting Tambola games and win amazing prizes
          </p>
        </div>

        {/* Join Game Card */}
        <Card className="mb-12 bg-white/95 backdrop-blur-sm shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-gray-800">Join a Game</CardTitle>
            <p className="text-gray-600">Enter your details to join an active Tambola game</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinGame} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="game-code">Game Code</Label>
                  <Input
                    id="game-code"
                    type="text"
                    placeholder="Enter game code"
                    value={gameCode}
                    onChange={(e) => setGameCode(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="player-name">Your Name</Label>
                  <Input
                    id="player-name"
                    type="text"
                    placeholder="Enter your name"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
              </div>
              <Button type="submit" size="lg" className="w-full">
                <Users className="w-5 h-5 mr-2" />
                Join Game
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Demo Game Card */}
        <Card className="mb-12 bg-white/95 backdrop-blur-sm shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-gray-800">Try Demo Game</CardTitle>
            <p className="text-gray-600">Experience Tambola with a demo game</p>
          </CardHeader>
          <CardContent className="text-center">
            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => setHasJoinedGame(true)}
              className="w-full"
            >
              <Search className="w-5 h-5 mr-2" />
              Start Demo Game
            </Button>
          </CardContent>
        </Card>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="text-center p-6">
              <Users className="w-12 h-12 mx-auto text-blue-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Easy to Join</h3>
              <p className="text-gray-600">No registration required. Just enter the game code and your name to start playing!</p>
            </CardContent>
          </Card>

          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="text-center p-6">
              <Clock className="w-12 h-12 mx-auto text-green-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Real-time Play</h3>
              <p className="text-gray-600">Experience live number calling with automatic ticket marking and instant updates.</p>
            </CardContent>
          </Card>

          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="text-center p-6">
              <Trophy className="w-12 h-12 mx-auto text-yellow-600 mb-4" />
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Multiple Prizes</h3>
              <p className="text-gray-600">Win various prizes including Quick Five, Lines, Corners, and Full House!</p>
            </CardContent>
          </Card>
        </div>

        {/* How to Play */}
        <Card className="bg-white/95 backdrop-blur-sm shadow-2xl">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-800 text-center">How to Play</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">1. Join the Game</h4>
                <p className="text-gray-600 mb-4">Get the game code from your host and enter it along with your name.</p>
                
                <h4 className="font-semibold text-gray-800 mb-2">2. Book Your Tickets</h4>
                <p className="text-gray-600 mb-4">Choose and book your Tambola tickets through WhatsApp.</p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">3. Play & Win</h4>
                <p className="text-gray-600 mb-4">Numbers are called automatically and marked on your tickets. Complete patterns to win prizes!</p>
                
                <h4 className="font-semibold text-gray-800 mb-2">4. Claim Prizes</h4>
                <p className="text-gray-600">Prizes are automatically detected and claimed when you complete winning patterns.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
