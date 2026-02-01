// src/services/EdgeTTSService.ts
// Edge TTS service using Microsoft's neural voices
// Uses en-US-MichelleNeural (energetic, game show style female voice)

import { EdgeTTS } from 'edge-tts-universal/browser';

// Voice configuration
const DEFAULT_VOICE = 'en-US-MichelleNeural'; // Energetic female voice

interface EdgeTTSOptions {
    voice?: string;
    rate?: string; // e.g., '+10%', '-20%', '+0%'
    pitch?: string; // e.g., '+5Hz', '-10Hz', '+0Hz'
    volume?: string; // e.g., '+0%'
}

class EdgeTTSService {
    private isPlaying = false;
    private currentAudio: HTMLAudioElement | null = null;
    private audioQueue: Array<{
        text: string;
        options: EdgeTTSOptions;
        onComplete?: () => void;
        onError?: (error: Error) => void;
    }> = [];
    private isProcessing = false;

    /**
     * Speak text using Edge TTS neural voice
     */
    async speak(
        text: string,
        options: EdgeTTSOptions = {},
        onComplete?: () => void,
        onError?: (error: Error) => void
    ): Promise<void> {
        // Add to queue
        this.audioQueue.push({
            text,
            options: {
                voice: options.voice || DEFAULT_VOICE,
                rate: options.rate || '+0%',
                pitch: options.pitch || '+0%',
                volume: options.volume || '+0%',
            },
            onComplete,
            onError,
        });

        // Process queue
        this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.audioQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.audioQueue.length > 0) {
            const item = this.audioQueue.shift()!;

            try {
                await this.synthesizeAndPlay(item.text, item.options);
                item.onComplete?.();
            } catch (error) {
                console.error('❌ EdgeTTS error:', error);
                item.onError?.(error as Error);
            }

            // Small gap between audio items
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.isProcessing = false;
    }

    private async synthesizeAndPlay(text: string, options: EdgeTTSOptions): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                console.log(`🎙️ EdgeTTS: Synthesizing "${text.substring(0, 30)}..." with ${options.voice}`);

                // Create TTS instance
                const tts = new EdgeTTS(text, options.voice!, {
                    rate: options.rate,
                    pitch: options.pitch,
                    volume: options.volume,
                });

                // Synthesize audio
                const result = await tts.synthesize();

                // Create blob from audio
                const audioBlob = new Blob([await result.audio.arrayBuffer()], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);

                // Create and play audio element
                const audio = new Audio(audioUrl);
                this.currentAudio = audio;
                this.isPlaying = true;

                audio.onended = () => {
                    this.isPlaying = false;
                    this.currentAudio = null;
                    URL.revokeObjectURL(audioUrl);
                    console.log('✅ EdgeTTS: Audio completed');
                    resolve();
                };

                audio.onerror = (event) => {
                    this.isPlaying = false;
                    this.currentAudio = null;
                    URL.revokeObjectURL(audioUrl);
                    reject(new Error('Audio playback failed'));
                };

                // Play the audio
                await audio.play();

            } catch (error) {
                this.isPlaying = false;
                reject(error);
            }
        });
    }

    /**
     * Play number announcement with game show excitement
     */
    async playNumber(number: number, onComplete?: () => void): Promise<void> {
        // Traditional bingo calls with excitement
        const traditionalCalls: { [key: number]: string } = {
            1: "Kelly's eye, number one!",
            2: "One little duck, number two!",
            7: "Lucky seven!",
            11: "Legs eleven!",
            13: "Unlucky for some, thirteen!",
            21: "Key of the door, twenty-one!",
            22: "Two little ducks, twenty-two!",
            44: "Droopy drawers, forty-four!",
            45: "Halfway there, forty-five!",
            88: "Two fat ladies, eighty-eight!",
            90: "Top of the shop, ninety!",
        };

        const text = traditionalCalls[number] || `Number ${number}!`;

        await this.speak(
            text,
            { rate: '+5%', pitch: '+10Hz' }, // Slightly faster and higher for excitement
            onComplete,
            (error) => console.error(`Failed to play number ${number}:`, error)
        );
    }

    /**
     * Play prize winner announcement with celebration tone
     */
    async playPrizeWinner(prizeName: string, playerName: string, onComplete?: () => void): Promise<void> {
        const celebrations = [
            `Amazing! ${prizeName} won by ${playerName}! Congratulations!`,
            `Fantastic! ${playerName} wins ${prizeName}! What a champion!`,
            `Incredible! ${playerName} takes home ${prizeName}! Well done!`,
        ];

        const text = celebrations[Math.floor(Math.random() * celebrations.length)];

        await this.speak(
            text,
            { rate: '+0%', pitch: '+15Hz' }, // Higher pitch for celebration
            onComplete,
            (error) => console.error('Failed to play prize announcement:', error)
        );
    }

    /**
     * Play game over announcement with excitement
     */
    async playGameOver(onComplete?: () => void): Promise<void> {
        const gameOverMessages = [
            "Game Over! What an exciting match! Thanks for playing!",
            "And that's a wrap! Game Over! See you next time!",
            "The game has ended! Congratulations to all our winners!",
        ];

        const text = gameOverMessages[Math.floor(Math.random() * gameOverMessages.length)];

        await this.speak(
            text,
            { rate: '-5%', pitch: '+5Hz' }, // Slightly slower for emphasis
            onComplete,
            (error) => console.error('Failed to play game over:', error)
        );
    }

    /**
     * Stop all audio
     */
    stop(): void {
        // Clear queue
        this.audioQueue = [];

        // Stop current audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        this.isPlaying = false;
        this.isProcessing = false;
    }

    /**
     * Check if audio is currently playing
     */
    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    /**
     * Get available voices (for future voice selection feature)
     */
    static getAvailableVoices(): { name: string; locale: string; gender: string }[] {
        return [
            { name: 'en-US-MichelleNeural', locale: 'en-US', gender: 'Female' },
            { name: 'en-US-JennyNeural', locale: 'en-US', gender: 'Female' },
            { name: 'en-US-AriaNeural', locale: 'en-US', gender: 'Female' },
            { name: 'en-US-GuyNeural', locale: 'en-US', gender: 'Male' },
            { name: 'en-US-DavisNeural', locale: 'en-US', gender: 'Male' },
            { name: 'en-IN-NeerjaNeural', locale: 'en-IN', gender: 'Female' },
            { name: 'en-IN-PrabhatNeural', locale: 'en-IN', gender: 'Male' },
            { name: 'en-GB-SoniaNeural', locale: 'en-GB', gender: 'Female' },
        ];
    }
}

// Export singleton instance
export const edgeTTSService = new EdgeTTSService();
export default edgeTTSService;
