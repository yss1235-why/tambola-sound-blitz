// src/components/AudioStatusComponent.tsx - FIXED: Show audio status for both hosts and users
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeX, AlertCircle, CheckCircle } from 'lucide-react';

interface AudioStatusComponentProps {
  showInGameHost?: boolean; // Show in host dashboard
}

export const AudioStatusComponent: React.FC<AudioStatusComponentProps> = ({
  showInGameHost = false
}) => {
  const [audioSupported, setAudioSupported] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [userInteracted, setUserInteracted] = useState<boolean>(false);
  const [showNotification, setShowNotification] = useState<boolean>(true);

  // Check audio support and status
  useEffect(() => {
    const checkAudioStatus = () => {
      if (!('speechSynthesis' in window)) {
        setAudioSupported(false);
        setAudioError('Speech synthesis not supported in this browser');
        return;
      }

      setAudioSupported(true);

      // Check if user has interacted
      const hasInteracted = document.querySelector('body')?.hasAttribute('data-user-interacted');
      setUserInteracted(hasInteracted || false);
    };

    checkAudioStatus();

    // Listen for user interaction
    const handleUserInteraction = () => {
      setUserInteracted(true);
      document.body.setAttribute('data-user-interacted', 'true');
    };

    if (!userInteracted) {
      const events = ['click', 'touch', 'keydown', 'mousedown'];
      events.forEach(event => {
        document.addEventListener(event, handleUserInteraction, { once: true, passive: true });
      });

      return () => {
        events.forEach(event => {
          document.removeEventListener(event, handleUserInteraction);
        });
      };
    }
  }, [userInteracted]);

  // Enable audio function
  const handleEnableAudio = async () => {
    if (!audioSupported) return;

    try {
      // Test speech synthesis
      const testUtterance = new SpeechSynthesisUtterance(' ');
      testUtterance.volume = 0.01;
      testUtterance.rate = 10;

      const success = await new Promise<boolean>((resolve) => {
        testUtterance.onend = () => resolve(true);
        testUtterance.onerror = (event) => {
          console.error('Audio test failed:', event.error);
          setAudioError(event.error === 'not-allowed'
            ? 'Audio blocked by browser. Please check browser settings.'
            : `Audio error: ${event.error}`
          );
          resolve(false);
        };

        window.speechSynthesis.speak(testUtterance);
        setTimeout(() => resolve(false), 2000);
      });

      if (success) {
        setAudioEnabled(true);
        setAudioError(null);
        // Hide notification after successful enablement
        setTimeout(() => setShowNotification(false), 3000);
      }
    } catch (error) {
      setAudioError('Failed to enable audio');
    }
  };

  // âœ… FIXED: Auto-hide notification if audio is working
  useEffect(() => {
    if (audioSupported && audioEnabled && !audioError) {
      const timer = setTimeout(() => setShowNotification(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [audioSupported, audioEnabled, audioError]);

  // Show in game host dashboard
  if (showInGameHost) {
    return (
      <Card className="border-border bg-muted">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {audioEnabled ? (
                <CheckCircle className="w-5 h-5 text-accent" />
              ) : (
                <VolumeX className="w-5 h-5 text-destructive" />
              )}
              <div>
                <p className="font-medium text-foreground">
                  Audio Status: {audioEnabled ? 'Enabled' : 'Disabled'}
                </p>
                {audioError && (
                  <p className="text-sm text-destructive">{audioError}</p>
                )}
                {!userInteracted && (
                  <p className="text-sm text-primary">Click anywhere to enable audio</p>
                )}
              </div>
            </div>
            {!audioEnabled && userInteracted && (
              <Button
                onClick={handleEnableAudio}
                size="sm"
                className="bg-primary hover:bg-primary/90"
              >
                Enable Audio
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // âœ… FIXED: CHANGE 3 - Disable user notifications
  if (!showInGameHost) {
    return null;
  }

  // Show floating notification for players when needed (this code will never run due to above change)
  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm animate-bounce-in">
      <Card className="border-border bg-muted shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {audioEnabled ? (
                <CheckCircle className="w-5 h-5 text-accent mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${audioEnabled ? 'text-accent border-accent/40' : 'text-primary border-primary/40'
                    }`}
                >
                  ðŸ”Š Game Audio
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotification(false)}
                  className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                >
                  Ã—
                </Button>
              </div>

              {audioEnabled ? (
                <p className="text-sm text-accent mb-2">
                  âœ… Audio enabled! You'll hear number announcements during the game.
                </p>
              ) : (
                <p className="text-sm text-foreground mb-2">
                  {!audioSupported
                    ? 'âŒ Audio not supported in this browser'
                    : !userInteracted
                      ? 'ðŸ‘† Click anywhere to enable game audio'
                      : audioError || 'ðŸ”‡ Audio disabled - click to enable'
                  }
                </p>
              )}

              {audioSupported && userInteracted && !audioEnabled && (
                <Button
                  onClick={handleEnableAudio}
                  size="sm"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Volume2 className="w-4 h-4 mr-2" />
                  Enable Game Audio
                </Button>
              )}

              {!audioSupported && (
                <p className="text-xs text-muted-foreground mt-2">
                  ðŸ’¡ Try using Chrome, Firefox, or Safari for audio support
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

