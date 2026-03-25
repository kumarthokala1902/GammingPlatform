/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SoundService {
  private sounds: Record<string, HTMLAudioElement> = {};
  private enabled: boolean = true;

  constructor() {
    this.loadSounds();
  }

  private loadSounds() {
    const soundUrls: Record<string, string> = {
      click: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
      score: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3',
      gameover: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
      success: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
      fail: 'https://assets.mixkit.co/active_storage/sfx/2021/2021-preview.mp3',
      move: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
      match: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3',
      smash: 'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3',
      bomb: 'https://assets.mixkit.co/active_storage/sfx/2574/2574-preview.mp3',
      engine: 'https://assets.mixkit.co/active_storage/sfx/2569/2569-preview.mp3',
      brake: 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3',
      crash: 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3',
    };

    Object.entries(soundUrls).forEach(([name, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      this.sounds[name] = audio;
    });
  }

  public play(name: string) {
    if (!this.enabled || !this.sounds[name]) return;
    
    // Clone to allow overlapping sounds
    const sound = this.sounds[name].cloneNode() as HTMLAudioElement;
    sound.play().catch(e => console.warn('Sound play failed:', e));
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public isEnabled() {
    return this.enabled;
  }
}

export const soundService = new SoundService();
