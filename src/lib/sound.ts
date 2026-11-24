import { createAudioPlayer, type AudioPlayer } from 'expo-audio'

let player: AudioPlayer | undefined

/** A short, soft falling two-note chime for a new notification. Silent if audio is unavailable. */
export function playNotification() {
  try {
    player ??= createAudioPlayer(require('../../assets/sounds/notification.wav'))
    void player.seekTo(0).catch(() => {})
    player.play()
  } catch {
    // Sound is a nicety; never let it break the caller.
  }
}
