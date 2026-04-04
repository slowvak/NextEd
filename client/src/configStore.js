export let appConfig = {
  window_level_presets: {
    Brain: { center: 40, width: 80 },
    Bone: { center: 500, width: 3000 },
    Lung: { center: -500, width: 1000 },
    Abd: { center: 125, width: 450 }
  },
  default_labels: {
    1: 'Label 1', 2: 'Label 2', 3: 'Label 3', 4: 'Label 4', 5: 'Label 5'
  }
};

export async function loadAppConfig() {
  try {
    const res = await fetch('/api/v1/config');
    if (res.ok) {
      appConfig = await res.json();
    }
  } catch (e) {
    console.warn('Failed to load app config, using defaults', e);
  }
}
