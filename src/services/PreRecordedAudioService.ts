// src/services/PreRecordedAudioService.ts
// Pre-recorded Opus audio playback service for number calling and prize announcements

// Prize ID to filename mapping
const PRIZE_FILE_MAP: Record<string, string> = {
  topLine: 'prize_topline',
  middleLine: 'prize_middleline',
  bottomLine: 'prize_bottomline',
  fullHouse: 'prize_fullhouse',
  secondFullHouse: 'prize_secondhouse',
  corners: 'prize_fourcorners',
  starCorner: 'prize_star',
  earlyFive: 'prize_early5',
  halfSheet: 'prize_halfsheet',
  fullSheet: 'prize_fullsheet',
  allTwins: 'prize_alltwins',
};

class PreRecordedAudioService {
  private currentAudio: HTMLAudioElement | null = null;
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private isPreloaded = false;
  private currentPlaybackRate: number = 1.0;

  constructor() {
  }

  /**
   * Set the global playback rate for all audio
   */
  setPlaybackRate(rate: number): void {
    this.currentPlaybackRate = Math.max(0.5, Math.min(2.0, rate));
    // Also update currently playing audio if any
    if (this.currentAudio) {
      this.currentAudio.playbackRate = this.currentPlaybackRate;
    }
  }

  /**
   * Play a game number announcement (1-90) using "Emily" voice
   */
  playNumber(num: number): Promise<void> {
    if (num < 1 || num > 90) {
      return Promise.resolve();
    }

    const audioPath = `/audio/numbers/${num}.opus`;
    return this.playAudio(audioPath, `number-${num}`);
  }

  /**
   * Play a ticket number announcement (1-571) using standard voice
   */
  playTicketNumber(num: number): Promise<void> {
    if (num < 1 || num > 571) {
      return Promise.resolve();
    }

    const audioPath = `/audio/ticket_numbers/${num}.opus`;
    return this.playAudio(audioPath, `ticket-number-${num}`);
  }

  /**
   * Play a prize announcement
   */
  playPrize(prizeId: string): Promise<void> {


    // Try direct lookup first (camelCase), then fallback to case-insensitive match
    let fileName = PRIZE_FILE_MAP[prizeId];


    if (!fileName) {
      // Normalize: lowercase + remove spaces to handle "topline" → "topLine" mismatch
      const normalizedInput = prizeId.toLowerCase().replace(/\s+/g, '');
      const matchingKey = Object.keys(PRIZE_FILE_MAP).find(
        key => key.toLowerCase() === normalizedInput
      );

      if (matchingKey) {
        fileName = PRIZE_FILE_MAP[matchingKey];
      }
    }

    if (!fileName) {
      console.warn(`🎵 [PlayPrize] ❌ NO FILE FOUND for prizeId: "${prizeId}" — skipping prize audio!`);
      return Promise.resolve();
    }

    const audioPath = `/audio/prizes/${fileName}.opus`;

    return this.playAudio(audioPath, `prize-${prizeId}`);
  }

  /**
   * Play game over announcement
   */
  playGameOver(): Promise<void> {
    const audioPath = '/audio/phrases/game_over.opus';
    return this.playAudio(audioPath, 'phrase-game-over');
  }

  /**
   * Play "Game Will Begin" announcement (during countdown)
   */
  playGameWillBegin(): Promise<void> {
    const audioPath = '/audio/phrases/game_will_begin.opus';
    return this.playAudio(audioPath, 'phrase-game-will-begin');
  }

  /**
   * Play "Congratulations" announcement (on winner page)
   */
  playCongratulations(): Promise<void> {
    const audioPath = '/audio/phrases/congratulations.opus';
    return this.playAudio(audioPath, 'phrase-congratulations');
  }

  /**
   * Play "Won By" announcement
   */
  playWonBy(): Promise<void> {
    const audioPath = '/audio/phrases/won_by.opus';
    return this.playAudio(audioPath, 'phrase-won-by');
  }

  /**
   * Play complete winner announcement sequence:
   * 1. Prize audio (e.g., "Full House!")
   * 2. "Won By" phrase
   * 3. Ticket number
   */
  async playWinnerAnnouncement(prizeId: string, ticketNumber: number): Promise<void> {


    // Step 1: Play prize audio

    await this.playPrize(prizeId);


    // Step 2: Play "Won By" phrase

    await this.playWonBy();


    // Step 3: Play ticket number

    await this.playTicketNumber(ticketNumber);

  }

  /**
   * Stop currently playing audio
   */
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }

  /**
   * Preload commonly used audio files for faster playback
   */
  preload(): void {
    if (this.isPreloaded) return;

    // Preload first 10 numbers (most likely to be called first)
    for (let i = 1; i <= 10; i++) {
      this.preloadAudio(`/audio/numbers/${i}.opus`);
    }

    // Preload commonly used ticket numbers (e.g. 1-10)
    for (let i = 1; i <= 10; i++) {
      this.preloadAudio(`/audio/ticket_numbers/${i}.opus`);
    }

    // Preload common prizes
    const commonPrizes = ['topLine', 'middleLine', 'bottomLine', 'fullHouse', 'corners'];
    commonPrizes.forEach(prizeId => {
      const fileName = PRIZE_FILE_MAP[prizeId];
      if (fileName) {
        this.preloadAudio(`/audio/prizes/${fileName}.opus`);
      }
    });

    // Preload phrase audio files
    this.preloadAudio('/audio/phrases/game_will_begin.opus');
    this.preloadAudio('/audio/phrases/game_over.opus');
    this.preloadAudio('/audio/phrases/congratulations.opus');

    this.isPreloaded = true;
  }

  /**
   * Internal: Play audio from path
   */
  private playAudio(audioPath: string, cacheKey: string): Promise<void> {
    return new Promise((resolve) => {
      // Stop any currently playing audio
      this.stop();

      // Check cache first
      let audio = this.audioCache.get(cacheKey);

      if (!audio) {
        audio = new Audio(audioPath);
        this.audioCache.set(cacheKey, audio);
      } else {
        // Reset cached audio
        audio.currentTime = 0;
      }

      this.currentAudio = audio;

      // FIX: Use resolved flag to prevent double-resolve
      let resolved = false;
      let timeout: NodeJS.Timeout;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          this.currentAudio = null;
          clearTimeout(timeout);
          resolve();
        }
      };

      // Set timeout first
      timeout = setTimeout(() => {
        cleanup();
      }, 10000); // 10 second timeout

      // FIX: Single onended handler (was duplicated before)
      audio.onended = () => {
        cleanup();
      };

      audio.onerror = (e) => {
        console.error(`🔊 [PlayAudio] ❌ ERROR for ${cacheKey}: onerror fired`, e);
        cleanup();
      };

      // Apply current playback rate
      audio.playbackRate = this.currentPlaybackRate;

      audio.play().then(() => {

      }).catch(error => {
        console.error(`🔊 [PlayAudio] ❌ PLAY FAILED for ${cacheKey}: ${error.message}`);
        cleanup();
      });
    });
  }


  /**
   * Internal: Preload audio file into cache
   */
  private preloadAudio(audioPath: string): void {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = audioPath;
    // Don't add to cache here - just trigger browser caching
  }

  /**
   * Check if audio is currently playing
   */
  isPlaying(): boolean {
    return this.currentAudio !== null && !this.currentAudio.paused;
  }

  /**
   * Clear audio cache (useful for memory management)
   */
  clearCache(): void {
    this.audioCache.clear();
    this.isPreloaded = false;
  }
}

// Export singleton instance
export const preRecordedAudioService = new PreRecordedAudioService();
export { PreRecordedAudioService };
