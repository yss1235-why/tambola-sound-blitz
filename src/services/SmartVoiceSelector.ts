// src/services/SmartVoiceSelector.ts
// Smart voice selection - picks the best available browser voice and tunes it for game show style

interface VoiceScore {
    voice: SpeechSynthesisVoice;
    score: number;
    reason: string;
}

/**
 * SmartVoiceSelector - finds and caches the best available voice on the user's device
 * Prefers neural/natural voices (indicated by "Neural", "Natural", "Enhanced", "Online" in name)
 */
class SmartVoiceSelector {
    private cachedVoice: SpeechSynthesisVoice | null = null;
    private voicesLoaded = false;

    constructor() {
        // Voices may load asynchronously
        if ('speechSynthesis' in window) {
            speechSynthesis.onvoiceschanged = () => {
                this.voicesLoaded = true;
                this.selectBestVoice();
            };
            // Try immediately in case voices are already loaded
            this.selectBestVoice();
        }
    }

    /**
     * Get the best available voice for game announcements
     */
    getBestVoice(): SpeechSynthesisVoice | null {
        if (this.cachedVoice) {
            return this.cachedVoice;
        }
        return this.selectBestVoice();
    }

    private selectBestVoice(): SpeechSynthesisVoice | null {
        if (!('speechSynthesis' in window)) {
            return null;
        }

        const voices = speechSynthesis.getVoices();
        if (voices.length === 0) {
            return null;
        }

        // Score each voice
        const scoredVoices: VoiceScore[] = voices.map(voice => ({
            voice,
            score: this.scoreVoice(voice),
            reason: this.getScoreReason(voice),
        }));

        // Sort by score (highest first)
        scoredVoices.sort((a, b) => b.score - a.score);

        // Log top 3 for debugging
        console.log('🎙️ Top voices available:', scoredVoices.slice(0, 3).map(v =>
            `${v.voice.name} (score: ${v.score}, ${v.reason})`
        ));

        this.cachedVoice = scoredVoices[0]?.voice || null;

        if (this.cachedVoice) {
            console.log(`✅ Selected voice: ${this.cachedVoice.name}`);
        }

        return this.cachedVoice;
    }

    private scoreVoice(voice: SpeechSynthesisVoice): number {
        let score = 0;
        const name = voice.name.toLowerCase();
        const lang = voice.lang.toLowerCase();

        // Prefer English
        if (lang.startsWith('en-us')) score += 50;
        else if (lang.startsWith('en-gb')) score += 40;
        else if (lang.startsWith('en')) score += 30;

        // Prefer neural/natural voices (huge bonus)
        if (name.includes('neural')) score += 100;
        if (name.includes('natural')) score += 90;
        if (name.includes('enhanced')) score += 80;
        if (name.includes('online')) score += 70;
        if (name.includes('premium')) score += 60;

        // Prefer female voices (more common for announcements)
        if (name.includes('female') || name.includes('zira') || name.includes('aria') ||
            name.includes('jenny') || name.includes('michelle') || name.includes('samantha') ||
            name.includes('sonia') || name.includes('neerja')) {
            score += 20;
        }

        // Specific high-quality voice names
        if (name.includes('aria')) score += 30; // Microsoft Aria is excellent
        if (name.includes('jenny')) score += 25;
        if (name.includes('guy')) score += 20; // Microsoft Guy
        if (name.includes('samantha')) score += 15; // macOS

        // Prefer local voices (faster)
        if (voice.localService) score += 10;

        // Penalize robotic voices
        if (name.includes('david')) score -= 20;
        if (name.includes('mark')) score -= 20;
        if (name.includes('espeak')) score -= 50;

        return score;
    }

    private getScoreReason(voice: SpeechSynthesisVoice): string {
        const name = voice.name.toLowerCase();
        if (name.includes('neural')) return 'Neural voice';
        if (name.includes('natural')) return 'Natural voice';
        if (name.includes('enhanced')) return 'Enhanced voice';
        if (name.includes('online')) return 'Online voice';
        if (name.includes('aria') || name.includes('jenny')) return 'Premium Microsoft';
        if (name.includes('samantha')) return 'Premium Apple';
        return 'Standard voice';
    }

    /**
     * Create a tuned utterance for game announcements
     */
    createTunedUtterance(
        text: string,
        type: 'number' | 'prize' | 'gameOver' = 'number'
    ): SpeechSynthesisUtterance {
        const utterance = new SpeechSynthesisUtterance(text);

        // Set best voice
        const bestVoice = this.getBestVoice();
        if (bestVoice) {
            utterance.voice = bestVoice;
        }

        // Tune based on type
        switch (type) {
            case 'number':
                utterance.rate = 0.85;  // Slightly slower for clarity
                utterance.pitch = 1.1;  // Slightly higher for energy
                utterance.volume = 1.0;
                break;
            case 'prize':
                utterance.rate = 0.9;   // Moderate pace
                utterance.pitch = 1.25; // Higher for excitement
                utterance.volume = 1.0;
                break;
            case 'gameOver':
                utterance.rate = 0.85;  // Slower for emphasis
                utterance.pitch = 1.15; // Celebratory
                utterance.volume = 1.0;
                break;
        }

        return utterance;
    }
}

// Export singleton
export const smartVoiceSelector = new SmartVoiceSelector();
export default smartVoiceSelector;
