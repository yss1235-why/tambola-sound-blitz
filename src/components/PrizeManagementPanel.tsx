// src/components/PrizeManagementPanel.tsx - Prize Management with Manual Override
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Trophy, 
  Award, 
  Users, 
  RotateCcw, 
  Plus, 
  Phone, 
  Clock,
  Target,
  Zap,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { GameData, Prize, firebaseService } from '@/services/firebase';
import { 
  validateAllTicketsForPrizes,
  getPrizeStatistics,
  getTicketProgress 
} from '@/utils/prizeValidation';

interface PrizeManagementPanelProps {
  gameData: GameData;
  onRefreshGame: () => void;
}

interface ManualAwardForm {
  prizeId: string;
  prizeName: string;
  winners: Array<{
    ticketId: string;
    playerName: string;
    playerPhone?: string;
  }>;
}

export const PrizeManagementPanel: React.FC<PrizeManagementPanelProps> = ({ 
  gameData, 
  onRefreshGame 
}) => {
  const [showManualAwardDialog, setShowManualAwardDialog] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [manualAwardForm, setManualAwardForm] = useState<ManualAwardForm>({
    prizeId: '',
    prizeName: '',
    winners: [{ ticketId: '', playerName: '', playerPhone: '' }]
  });
  const [isLoading, setIsLoading] = useState(false);
  const [validationResults, setValidationResults] = useState<any>(null);
  
  const { toast } = useToast();

  // Get booked tickets for validation
  const bookedTickets = gameData.tickets ? 
    Object.values(gameData.tickets).filter(ticket => ticket.isBooked) : [];

  // Calculate prize statistics
  const calledNumbers = gameData.gameState.calledNumbers || [];
  const prizeStats = bookedTickets.length > 0 ? 
    getPrizeStatistics(gameData.tickets || {}, calledNumbers, gameData.prizes) : null;

  // Manual prize validation
  const runManualValidation = async () => {
    if (calledNumbers.length === 0) {
      toast({
        title: "No Numbers Called",
        description: "Cannot validate prizes - no numbers have been called yet.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await firebaseService.validateCurrentPrizes(gameData.gameId);
      setValidationResults(result);
      setShowValidationDialog(true);
      
      if (Object.keys(result.winners).length > 0) {
        toast({
          title: "Validation Complete",
          description: `Found ${Object.keys(result.winners).length} potential winners!`,
        });
      } else {
        toast({
          title: "Validation Complete",
          description: "No winners detected with current numbers.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Validation Error",
        description: error.message || "Failed to validate prizes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Reset a specific prize
  const resetPrize = async (prizeId: string, prizeName: string) => {
    const confirmed = window.confirm(`Are you sure you want to reset "${prizeName}"? This will remove all winners for this prize.`);
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await firebaseService.resetPrize(gameData.gameId, prizeId);
      
      toast({
        title: "Prize Reset",
        description: `${prizeName} has been reset successfully.`,
      });
      
      onRefreshGame();
    } catch (error: any) {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset prize",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Open manual award dialog
  const openManualAwardDialog = (prizeId: string, prizeName: string) => {
    setManualAwardForm({
      prizeId,
      prizeName,
      winners: [{ ticketId: '', playerName: '', playerPhone: '' }]
    });
    setShowManualAwardDialog(true);
  };

  // Add winner to manual award form
  const addWinnerToForm = () => {
    setManualAwardForm(prev => ({
      ...prev,
      winners: [...prev.winners, { ticketId: '', playerName: '', playerPhone: '' }]
    }));
  };

  // Remove winner from manual award form
  const removeWinnerFromForm = (index: number) => {
    if (manualAwardForm.winners.length > 1) {
      setManualAwardForm(prev => ({
        ...prev,
        winners: prev.winners.filter((_, i) => i !== index)
      }));
    }
  };

  // Update winner in manual award form
  const updateWinnerInForm = (index: number, field: string, value: string) => {
    setManualAwardForm(prev => ({
      ...prev,
      winners: prev.winners.map((winner, i) => 
        i === index ? { ...winner, [field]: value } : winner
      )
    }));
  };

  // Submit manual award
  const submitManualAward = async () => {
    const validWinners = manualAwardForm.winners.filter(w => 
      w.ticketId.trim() && w.playerName.trim()
    );

    if (validWinners.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please enter at least one winner with ticket ID and name.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await firebaseService.awardPrizeManually(
        gameData.gameId,
        manualAwardForm.prizeId,
        validWinners
      );

      toast({
        title: "Prize Awarded",
        description: `${manualAwardForm.prizeName} has been awarded to ${validWinners.length} winner(s).`,
      });

      setShowManualAwardDialog(false);
      onRefreshGame();
    } catch (error: any) {
      toast({
        title: "Award Failed",
        description: error.message || "Failed to award prize",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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

  // Format winner display
  const formatWinners = (winners: Prize['winners']) => {
    if (!winners || winners.length === 0) return '';
    
    if (winners.length === 1) {
      const winner = winners[0];
      return `${winner.name} (Ticket ${winner.ticketId})`;
    }
    
    return `${winners.length} winners: ${winners.map(w => `${w.name} (T${w.ticketId})`).join(', ')}`;
  };

  return (
    <div className="space-y-6">
      {/* Prize Management Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Trophy className="w-6 h-6 mr-2" />
              Prize Management & Validation
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={runManualValidation}
                disabled={isLoading || calledNumbers.length === 0}
                variant="outline"
                size="sm"
              >
                <Target className="w-4 h-4 mr-2" />
                Validate Now
              </Button>
            </div>
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
              <strong>Auto Validation Active:</strong> Winners are automatically detected when numbers are called. 
              Multiple winners are supported if they win on the same number call.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Prize List */}
      <Card>
        <CardHeader>
          <CardTitle>Prize Status & Management</CardTitle>
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
                              Won on number {prize.winningNumber}
                            </Badge>
                          )}
                          {prize.won && prize.wonAt && (
                            <Badge variant="outline">
                              <Clock className="w-3 h-3 mr-1" />
                              {new Date(prize.wonAt).toLocaleTimeString()}
                            </Badge>
                          )}
                        </div>

                        {/* Winners Display */}
                        {prize.won && prize.winners && prize.winners.length > 0 && (
                          <div className="bg-white p-3 rounded border">
                            <p className="text-sm font-medium text-gray-700 mb-2">Winners:</p>
                            <div className="space-y-1">
                              {prize.winners.map((winner, index) => (
                                <div key={index} className="flex items-center justify-between text-sm">
                                  <span className="font-medium text-gray-800">
                                    {winner.name} - Ticket {winner.ticketId}
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
                          <div className="bg-white p-3 rounded border">
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
                            <p className="text-xs text-gray-500 mt-1">
                              {progress.playersClose} player(s) are 80%+ complete
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col space-y-2 ml-4">
                        {!prize.won && (
                          <Button
                            onClick={() => openManualAwardDialog(prize.id, prize.name)}
                            size="sm"
                            variant="outline"
                          >
                            <Award className="w-3 h-3 mr-1" />
                            Manual Award
                          </Button>
                        )}
                        {prize.won && (
                          <Button
                            onClick={() => resetPrize(prize.id, prize.name)}
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Manual Award Dialog */}
      <Dialog open={showManualAwardDialog} onOpenChange={setShowManualAwardDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manually Award Prize: {manualAwardForm.prizeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Manual award will override automatic validation. Use this only for corrections or special cases.
              </AlertDescription>
            </Alert>

            {manualAwardForm.winners.map((winner, index) => (
              <div key={index} className="border rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Winner {index + 1}</Label>
                  {manualAwardForm.winners.length > 1 && (
                    <Button
                      onClick={() => removeWinnerFromForm(index)}
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                
                <div>
                  <Label htmlFor={`ticket-${index}`}>Ticket ID *</Label>
                  <Input
                    id={`ticket-${index}`}
                    placeholder="e.g., 123"
                    value={winner.ticketId}
                    onChange={(e) => updateWinnerInForm(index, 'ticketId', e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor={`name-${index}`}>Player Name *</Label>
                  <Input
                    id={`name-${index}`}
                    placeholder="Enter player name"
                    value={winner.playerName}
                    onChange={(e) => updateWinnerInForm(index, 'playerName', e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor={`phone-${index}`}>Phone Number (Optional)</Label>
                  <Input
                    id={`phone-${index}`}
                    placeholder="Enter phone number"
                    value={winner.playerPhone}
                    onChange={(e) => updateWinnerInForm(index, 'playerPhone', e.target.value)}
                  />
                </div>
              </div>
            ))}

            <Button
              onClick={addWinnerToForm}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Another Winner
            </Button>

            <div className="flex space-x-2 pt-4">
              <Button
                onClick={submitManualAward}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? 'Awarding...' : 'Award Prize'}
              </Button>
              <Button
                onClick={() => setShowManualAwardDialog(false)}
                variant="outline"
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Validation Results Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prize Validation Results</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {validationResults && Object.keys(validationResults.winners).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(validationResults.winners).map(([prizeId, prizeWinners]: [string, any]) => (
                  <Card key={prizeId} className="border-green-200 bg-green-50">
                    <CardContent className="p-4">
                      <div className="flex items-center mb-2">
                        <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                        <h3 className="font-semibold text-green-800">{prizeWinners.prizeName}</h3>
                      </div>
                      <p className="text-sm text-green-700 mb-2">
                        Winning Number: {prizeWinners.winningNumber}
                      </p>
                      <div className="space-y-1">
                        {prizeWinners.winners.map((winner: any, index: number) => (
                          <div key={index} className="text-sm text-green-800">
                            <strong>{winner.playerName}</strong> - Ticket {winner.ticketId}
                            {winner.playerPhone && ` (${winner.playerPhone})`}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No winners detected with current called numbers.</p>
                <p className="text-gray-500 text-sm mt-2">
                  Winners will be automatically detected when they complete winning patterns.
                </p>
              </div>
            )}

            {validationResults?.statistics && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2">Validation Statistics</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700">Total Tickets:</span>
                    <span className="font-medium ml-2">{validationResults.statistics.totalTickets}</span>
                  </div>
                  <div>
                    <span className="text-blue-700">Booked Tickets:</span>
                    <span className="font-medium ml-2">{validationResults.statistics.bookedTickets}</span>
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={() => setShowValidationDialog(false)}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
