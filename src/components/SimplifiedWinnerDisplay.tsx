// src/components/SimplifiedWinnerDisplay.tsx - VERIFIED: Mobile-optimized winner display for hosts
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, User, Play, CheckCircle } from 'lucide-react';
import { GameData } from '@/services/firebase';

interface SimplifiedWinnerDisplayProps {
  gameData: GameData;
  onCreateNewGame: () => void; // ✅ VERIFIED: Correct function signature for the flow
}

export const SimplifiedWinnerDisplay: React.FC<SimplifiedWinnerDisplayProps> = ({ 
  gameData, 
  onCreateNewGame 
}) => {
  const wonPrizes = Object.values(gameData.prizes).filter(p => p.won);
  const totalWinners = wonPrizes.reduce((total, prize) => total + (prize.winners?.length || 0), 0);
  // 🔊 Game Over Audio Announcement
 // 🔊 Game Over Audio Announcement - MEGA FUN VERSION!
  React.useEffect(() => {
    // HUGE array of fun celebration messages!
    const funMessages = [
      // 🎊 Classic Celebrations
      `Game Over! Woohoo! ${totalWinners} champion${totalWinners !== 1 ? 's' : ''} emerged victorious! Party time!`,
      `And that's a wrap folks! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} are taking home the glory!`,
      `Boom! Game Over! High fives to our ${totalWinners} superstar${totalWinners !== 1 ? 's' : ''}! You rocked it!`,
      `Ladies and gentlemen, the game has ended! Let's hear it for our ${totalWinners} amazing winner${totalWinners !== 1 ? 's' : ''}!`,
      `That's all folks! ${totalWinners} player${totalWinners !== 1 ? 's' : ''} can now do the victory dance!`,
      
      // 🎯 Energetic & Exciting
      `Game Over! ${totalWinners} legend${totalWinners !== 1 ? 's' : ''} have conquered the game! Absolutely brilliant!`,
      `Stop the press! Game Over! We have ${totalWinners} incredible winner${totalWinners !== 1 ? 's' : ''}! Take a bow!`,
      `Ding ding ding! That's a game! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} are celebrating tonight!`,
      `Jackpot! Game finished! ${totalWinners} lucky winner${totalWinners !== 1 ? 's' : ''} hit the jackpot! Amazing!`,
      `Holy moly! That's a wrap! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} crushed it! Outstanding!`,
      
      // 😄 Funny & Quirky
      `Bingo! Oh wait, wrong game! Tambola Over! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} for the win!`,
      `Alert! Alert! Game Over! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} detected! Initiating celebration protocol!`,
      `Breaking news! ${totalWinners} player${totalWinners !== 1 ? 's' : ''} just won! In other news, everyone else didn't!`,
      `Houston, we have winners! ${totalWinners} of them to be exact! Mission accomplished!`,
      `Roses are red, violets are blue, game is over, ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} woohoo!`,
      
      // 🎪 Circus/Show Style
      `Step right up! Step right up! We have ${totalWinners} magnificent winner${totalWinners !== 1 ? 's' : ''}! Spectacular!`,
      `Roll up! Roll up! The show is over! ${totalWinners} star${totalWinners !== 1 ? 's' : ''} steal the spotlight!`,
      `And the crowd goes wild! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} take the stage! Bravo!`,
      `Ladies and gents, boys and girls! ${totalWinners} champion${totalWinners !== 1 ? 's' : ''} have triumphed!`,
      
      // 🏆 Sports Commentary Style
      `And it's all over! ${totalWinners} player${totalWinners !== 1 ? 's' : ''} cross the finish line! What a match!`,
      `The final whistle blows! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} take home the trophy!`,
      `Game, set, match! ${totalWinners} champion${totalWinners !== 1 ? 's' : ''} claim victory! Sensational!`,
      `And that's the final bell! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} are knockout champions!`,
      `Goal! Wait no, Game Over! ${totalWinners} player${totalWinners !== 1 ? 's' : ''} score big time!`,
      
      // 🎮 Game Show Host Style
      `Survey says... Game Over! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} take the prize! Fantastic!`,
      `Come on down! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''}, you're the next Tambola champion${totalWinners !== 1 ? 's' : ''}!`,
      `Wheel... of... Fortune! Oh sorry, Tambola Over! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} win big!`,
      `Is that your final answer? Yes! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} got it right!`,
      
      // 🌟 Motivational/Epic
      `Champions are made today! ${totalWinners} hero${totalWinners !== 1 ? 'es' : ''} rise to glory! Epic win!`,
      `History in the making! ${totalWinners} legend${totalWinners !== 1 ? 's' : ''} write their names in gold!`,
      `Dreams come true! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} achieve greatness! Inspiring!`,
      `Against all odds! ${totalWinners} warrior${totalWinners !== 1 ? 's' : ''} claim victory! Phenomenal!`,
      
      // 🎭 Dramatic/Theatre
      `And scene! The curtain falls! ${totalWinners} star${totalWinners !== 1 ? 's' : ''} take their final bow!`,
      `The show must go on! But not this one, it's over! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''}! Magnificent!`,
      `Exit stage left! But first, congratulate our ${totalWinners} brilliant performer${totalWinners !== 1 ? 's' : ''}!`,
      
      // 🚀 Modern/Tech Style
      `Download complete! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} successfully installed! GG!`,
      `Achievement unlocked! ${totalWinners} player${totalWinners !== 1 ? 's' : ''} completed the mission! Level up!`,
      `Victory.exe has loaded! ${totalWinners} user${totalWinners !== 1 ? 's' : ''} won the game! Press F to pay respects!`,
      `404 Error: Losers not found! Just kidding! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} found instead!`,
      
      // 🍾 Party/Celebration
      `Pop the champagne! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} are partying tonight! Cheers!`,
      `Confetti cannon ready! Fire! ${totalWinners} champion${totalWinners !== 1 ? 's' : ''} deserve a celebration!`,
      `DJ, drop the beat! ${totalWinners} winner${totalWinners !== 1 ? 's' : ''} own the dance floor! Let's party!`,
      `Fireworks time! ${totalWinners} superstar${totalWinners !== 1 ? 's' : ''} light up the sky! Dazzling!`
    ];

    // Pick a random message
    const randomMessage = funMessages[Math.floor(Math.random() * funMessages.length)];
    
    // Play after 2 second delay
    const timer = setTimeout(() => {
      if (window.speechSynthesis) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        // Create and play the announcement
        const utterance = new SpeechSynthesisUtterance(randomMessage);
        utterance.rate = 0.95; // Slightly slower for clarity
        utterance.pitch = 1.15; // Higher pitch for excitement
        utterance.volume = 1.0; // Full volume
        
        console.log('🎯 Playing Game Over audio:', randomMessage);
        window.speechSynthesis.speak(utterance);
      }
    }, 2000); // 2 second delay
    
    // Cleanup function
    return () => {
      clearTimeout(timer);
      // Don't cancel speech on cleanup so audio can finish
    };
  }, []); // Empty dependency array = runs once when component mounts

  // ✅ PRESERVE: All existing console logs for debugging
  console.log('🏆 SimplifiedWinnerDisplay rendered for game:', gameData.gameId);
  console.log('📊 Winner summary:', { totalWinners, prizesWon: wonPrizes.length });

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 p-2 sm:p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        
        {/* Celebration Header - Compact Mobile-Optimized */}
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
                Winners
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
                <p className="text-gray-500 text-xs mt-1">
                  Game ended with {gameData.gameState.calledNumbers?.length || 0} numbers called.
                </p>
              </div>
            ) : (
              <div className="space-y-1 sm:space-y-2">
                {wonPrizes
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((prize) => (
                  <Card key={prize.id} className="bg-green-50 border-green-200">
                    <CardContent className="p-1.5 sm:p-2">
                      {/* Prize Header - Single Line */}
                      <div className="flex items-center justify-between mb-1">
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
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                          {prize.winners.map((winner, idx) => (
                           <div key={idx} className="bg-white rounded p-1.5 border border-green-200">
                             <div className="flex items-center justify-center space-x-1">
                                <User className="w-3 h-3 text-gray-600 flex-shrink-0" />
                                <span className="font-medium text-gray-800 text-xs sm:text-sm truncate">
                                  {winner.name}
                                </span>
                                <Badge variant="outline" className="text-xs border-gray-300 text-gray-600">
                                  No. {winner.ticketId}
                                </Badge>
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
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <Button 
              onClick={() => {
                console.log('🎮 Host clicked Create New Game from winner display');
                console.log('🔄 Triggering flow: Alert → Setup Mode → Configure → Create & Open Booking');
                onCreateNewGame(); // This will trigger the alert and flow in GameHost.tsx
              }}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 text-sm sm:text-base font-semibold w-full sm:w-auto"
              size="lg"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Create New Game
            </Button>
          </CardContent>
        </Card>

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
