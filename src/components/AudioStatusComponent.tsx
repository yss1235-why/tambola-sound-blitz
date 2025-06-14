// src/components/AudioStatusComponent.tsx - Visual component for audio status
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeX, AlertCircle } from 'lucide-react';

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
      }
    } catch (error) {
      setAudioError('Failed to enable audio');
    }
  };

  // Don't show anything if audio is working fine
  if (audioSupported && audioEnabled && !audioError) {
    return null;
  }

  // Show in game host dashboard
  if (showInGameHost) {
    return (
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {audioEnabled ? (
                <Volume2 className="w-5 h-5 text-green-600" />
              ) : (
                <VolumeX className="w-5 h-5 text-red-600" />
              )}
              <div>
                <p className="font-medium text-gray-800">
                  Audio Status: {audioEnabled ? 'Enabled' : 'Disabled'}
                </p>
                {audioError && (
                  <p className="text-sm text-red-600">{audioError}</p>
                )}
                {!userInteracted && (
                  <p className="text-sm text-yellow-600">Click anywhere to enable audio</p>
                )}
              </div>
            </div>
            {!audioEnabled && userInteracted && (
              <Button
                onClick={handleEnableAudio}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                Enable Audio
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show floating notification for players
  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <Card className="border-yellow-400 bg-yellow-50 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <Badge variant="outline" className="text-yellow-700 border-yellow-400">
                  Audio Status
                </Badge>
              </div>
              <p className="text-sm text-yellow-800 mb-2">
                {!audioSupported 
                  ? 'Audio not supported in this browser'
                  : !userInteracted 
                    ? 'Click anywhere to enable game audio'
                    : audioError || 'Audio disabled'
                }
              </p>
              {audioSupported && userInteracted && !audioEnabled && (
                <Button
                  onClick={handleEnableAudio}
                  size="sm"
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                >
                  <Volume2 className="w-4 h-4 mr-2" />
                  Enable Audio
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
