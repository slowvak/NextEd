// Copyright Bradley J Erickson, 2026.
const SEEN_KEY = 'sigma_splash_seen';

/**
 * Shows a fullscreen splash video the first time the app is opened.
 * Resolves immediately if already seen (localStorage flag set).
 * Resolves when the video ends, the user clicks Skip, or presses Esc/Space.
 */
export function showSplashIfNeeded() {
  if (localStorage.getItem(SEEN_KEY)) return Promise.resolve();

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'splash-overlay';

    const video = document.createElement('video');
    video.src = '/SplashVideo.mp4';
    video.autoplay = true;
    video.muted = true;       // required for autoplay without prior user gesture
    video.playsInline = true;
    video.preload = 'auto';

    const skip = document.createElement('button');
    skip.className = 'splash-skip';
    skip.textContent = 'Skip';

    overlay.appendChild(video);
    overlay.appendChild(skip);
    document.body.appendChild(overlay);

    function dismiss() {
      localStorage.setItem(SEEN_KEY, '1');
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('splash-fade-out');
      overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
      resolve();
    }

    function onKey(e) {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        dismiss();
      }
    }

    video.addEventListener('ended', dismiss);
    skip.addEventListener('click', dismiss);
    document.addEventListener('keydown', onKey);

    // If the video file is missing, don't block the app
    video.addEventListener('error', dismiss);
  });
}
