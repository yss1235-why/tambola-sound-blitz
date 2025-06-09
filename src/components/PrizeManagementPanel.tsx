// src/components/PrizeManagementPanel.tsx - Automatic Prize Validation Only
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Trophy, 
  Phone, 
  Clock,
  Zap,
  CheckCircle,
  Timer,
  Target
} from 'lucide-react';
import { GameData, Prize } from '@/services/firebase';
import { 
  getPrizeStatistics,
  getTicketProgress 
} from '@/utils/prizeValidation';

interface PrizeManagementPanelProps {
  gameData: GameData;
  onRefreshGame: () => void;
}

export const PrizeManagementPanel: React.FC<PrizeManagementPanelProps> = ({ 
  gameData 
}) => {
  // Get booked tickets for validation
  const bookedTickets = gameData.tickets ? 
    Object.values(gameData.tickets).filter(ticket => ticket.isBooked) : [];

  // Calculate prize statistics
  const calledNumbers = gameData.gameState.calledNumbers || [];
  const prizeStats = bookedTickets.length > 0 ? 
    getPrizeStatistics(gameData.tickets || {}, calledNumbers, gameData.prizes) : null;

  // Get prize display info
  const getPrizeDisplayInfo = (prize: Prize) => {
    if (!prize.won) {
      return {
        status: 'pending',
        icon: '⏳',
        className: 'bg-gray-50 border-gray-200',
        badgeVariant: 'secondary' as const,
        statusText: 'Not Won'
      };
    }

    const winnerCount = prize.winners?.length || 0;
    return {
      status: 'won',
      icon: '🏆',
      className: 'bg-green-50 border-green-200',
      badgeVariant: 'default' as const,
      statusText: `Won by ${winnerCount} player${winnerCount !== 1 ? 's' : ''}`
    };
  };

  return (
    <div className="space-y-6">
      {/* Prize Management Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Trophy className="w-6 h-6 mr-2" />
              Automatic Prize Validation Status
            </div>
            <Badge className="bg-green-600">
              <Zap className="w-3 h-3 mr-1" />
              Auto Detection Active
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Validation Status */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">
                {Object.keys(gameData.prizes).length}
              </div>
              <div className="text-sm text-blue-700">Total Prizes</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="text-2xl font-bold text-green-600">
                {Object.values(gameData.prizes).filter(p => p.won).length}
              </div>
              <div className="text-sm text-green-700">Prizes Won</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-2xl font-bold text-purple-600">
                {Object.values(gameData.prizes).reduce((total, prize) => 
                  total + (prize.winners?.length || 0), 0
                )}
              </div>
              <div className="text-sm text-purple-700">Total Winners</div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
              <div className="text-2xl font-bold text-orange-600">
                {bookedTickets.length}
              </div>
              <div className="text-sm text-orange-700">Active Players</div>
            </div>
          </div>

          {/* Auto Validation Status */}
          <Alert className="mb-4">
            <Zap className="h-4 w-4" />
            <AlertDescription>
              <strong>Fully Automatic System:</strong> Winners are automatically detected and announced when numbers are called. 
              Multiple winners are supported if they complete patterns on the same number call. No manual intervention required!
            </AlertDescription>
          </Alert>

          {/* Real-time Detection Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center mb-2">
                <Target className="w-5 h-5 text-blue-600 mr-2" />
                <h4 className="font-semibold text-blue-800">Detection Speed</h4>
              </div>
              <p className="text-sm text-blue-700">
                Winners are detected instantly when numbers are called. 
                Average detection time: &lt;100ms
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center mb-2">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                <h4 className="font-semibold text-green-800">Accuracy</h4>
              </div>
              <p className="text-sm text-green-700">
                100% automatic validation ensures fair and accurate results.
                No human error possible.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prize List */}
      <Card>
        <CardHeader>
          <CardTitle>Prize Status & Real-time Updates</CardTitle>
          <p className="text-sm text-gray-600">
            All prizes are monitored automatically. Winners are announced immediately when patterns are completed.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.values(gameData.prizes).map((prize) => {
              const displayInfo = getPrizeDisplayInfo(prize);
              const progress = prizeStats?.prizeProgress[prize.id];
              
              return (
                <Card key={prize.id} className={`${displayInfo.className} transition-all duration-200`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          <span className="text-2xl mr-3">{displayInfo.icon}</span>
                          <div>
                            <h3 className="font-bold text-lg text-gray-800">{prize.name}</h3>
                            <p className="text-sm text-gray-600">{prize.pattern}</p>
                          </div>
                        </div>
                        
                        {/* Prize Status */}
                        <div className="flex items-center space-x-4 mb-3">
                          <Badge variant={displayInfo.badgeVariant}>
                            {displayInfo.statusText}
                          </Badge>
                          {prize.won && prize.winningNumber && (
                            <Badge variant="outline">
                              <Target className="w-3 h-3 mr-1" />
                              Won on number {prize.winningNumber}
                            </Badge>
                          )}
                          {prize.won && prize.wonAt && (
                            <Badge variant="outline">
                              <Clock className="w-3 h-3 mr-1" />
                              {new Date(prize.wonAt).toLocaleTimeString()}
                            </Badge>
                          )}
                          {!prize.won && (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              <Timer className="w-3 h-3 mr-1" />
                              Auto-monitoring
                            </Badge>
                          )}
                        </div>

                        {/* Winners Display */}
                        {prize.won && prize.winners && prize.winners.length > 0 && (
                          <div className="bg-white p-3 rounded border border-green-200">
                            <div className="flex items-center mb-2">
                              <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                              <p className="text-sm font-medium text-green-700">
                                Automatically Detected Winners:
                              </p>
                            </div>
                            <div className="space-y-1">
                              {prize.winners.map((winner, index) => (
                                <div key={index} className="flex items-center justify-between text-sm">
                                  <span className="font-medium text-gray-800">
                                    🎉 {winner.name} - Ticket {winner.ticketId}
                                  </span>
                                  {winner.phone && (
                                    <span className="text-gray-500 flex items-center">
                                      <Phone className="w-3 h-3 mr-1" />
                                      {winner.phone}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Progress Info for Pending Prizes */}
                        {!prize.won && progress && bookedTickets.length > 0 && (
                          <div className="bg-white p-3 rounded border border-blue-200">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium text-gray-700">Player Progress</span>
                              <span className="text-sm text-gray-600">{progress.averageProgress}% average</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress.averageProgress}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between items-center mt-2">
                              <p className="text-xs text-gray-500">
                                {progress.playersClose} player(s) are 80%+ complete
                              </p>
                              <p className="text-xs text-blue-600 font-medium">
                                Auto-monitoring for completion
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Pattern Description for Pending Prizes */}
                        {!prize.won && (
                          <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                            <div className="flex items-center">
                              <Zap className="w-4 h-4 text-blue-600 mr-2" />
                              <p className="text-xs text-blue-700">
                                <strong>Auto-detection active:</strong> Winners will be announced instantly when this pattern is completed.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* No Prizes Message */}
          {Object.keys(gameData.prizes).length === 0 && (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No prizes configured for this game.</p>
              <p className="text-gray-500 text-sm mt-2">
                Prizes are configured when creating a new game.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Automatic System Benefits */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="text-green-800 flex items-center">
            <CheckCircle className="w-5 h-5 mr-2" />
            Automatic Prize System Benefits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-green-800">🚀 Speed & Accuracy</h4>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• Instant winner detection (&lt;100ms)</li>
                <li>• 100% accurate pattern validation</li>
                <li>• No human error possible</li>
                <li>• Real-time announcements</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-green-800">🎯 Fair Play</h4>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• Multiple winners supported</li>
                <li>• Same-number-call tie handling</li>
                <li>• Transparent validation process</li>
                <li>• Consistent rule application</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
